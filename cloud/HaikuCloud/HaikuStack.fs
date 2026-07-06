module HaikuStack

open System
open Amazon.CDK
open Amazon.CDK.AWS.S3
open Amazon.CDK.AWS.CloudFront
open Amazon.CDK.AWS.CloudFront.Origins
open Amazon.CDK.AWS.IAM
open Constructs

type HaikuStack internal (scope: Construct, id: string, props: IStackProps) as this =
    inherit Stack(scope, id, props)

    do
        // GitHub Actions OIDC federation — the deploy workflow assumes this role
        // using a short-lived token instead of long-lived IAM access keys, so no
        // AWS credentials are ever stored as GitHub secrets or CDK env vars.
        // repoSlug must be "owner/repo" (e.g. "bentok/haiku"); read from an env
        // var rather than hardcoded so this stack stays copy-paste portable.
        let repoSlug =
            Environment.GetEnvironmentVariable("GITHUB_REPO_SLUG")
            |> Option.ofObj
            |> Option.defaultWith (fun () -> failwith "GITHUB_REPO_SLUG environment variable is required")

        let githubOidcProvider =
            OidcProviderNative(
                this,
                "GitHubOidcProvider",
                OidcProviderNativeProps(
                    Url = "https://token.actions.githubusercontent.com",
                    ClientIds = [| "sts.amazonaws.com" |]
                )
            )

        let githubTrust =
            WebIdentityPrincipal(
                githubOidcProvider.OidcProviderArn,
                dict
                    [ "StringEquals", box (dict [ "token.actions.githubusercontent.com:aud", "sts.amazonaws.com" ])
                      "StringLike",
                      box (
                          dict
                              [ "token.actions.githubusercontent.com:sub", $"repo:{repoSlug}:ref:refs/heads/main" ]
                      ) ]
            )

        // This role is granted NO direct AWS permissions of its own. Instead it may
        // only assume the CDK bootstrap roles (deploy/file-publishing/lookup), which
        // is the standard AWS-documented way to let CI run `cdk deploy` without
        // granting broad permissions directly to a CI identity. Those bootstrap
        // roles already carry exactly the permissions CDK deployments need — see
        // https://docs.aws.amazon.com/cdk/v2/guide/best-practices-security.html
        let deployRole =
            Role(
                this,
                "GitHubActionsDeployRole",
                RoleProps(
                    AssumedBy = githubTrust,
                    InlinePolicies =
                        dict
                            [ "AssumeCdkBootstrapRoles",
                              PolicyDocument(
                                  PolicyDocumentProps(
                                      Statements =
                                          [| PolicyStatement(
                                                 PolicyStatementProps(
                                                     Effect = Effect.ALLOW,
                                                     Actions = [| "sts:AssumeRole" |],
                                                     Resources = [| "*" |],
                                                     Conditions =
                                                         dict
                                                             [ "StringEquals",
                                                               box (
                                                                   dict
                                                                       [ "iam:ResourceTag/aws-cdk:bootstrap-role",
                                                                         box (
                                                                             [| "deploy"
                                                                                "file-publishing"
                                                                                "lookup" |]
                                                                         ) ]
                                                               ) ]
                                                 )
                                             ) |]
                                  )
                              ) ]
                )
            )

        // Separate, narrowly-scoped role for the site-sync workflow (S3 sync +
        // CloudFront invalidation only) — it must NOT be able to assume the CDK
        // bootstrap deploy role, since that would let a content push modify
        // infrastructure. Granted directly on this stack's own bucket/distribution.
        let siteDeployRole =
            Role(
                this,
                "GitHubActionsSiteDeployRole",
                RoleProps(AssumedBy = githubTrust)
            )

        // Private bucket, no public access — CloudFront reads via Origin Access Control.
        // No BucketName set: CDK generates a unique name so nothing bucket-identifying
        // ever appears in source or git history.
        let bucket =
            Bucket(
                this,
                "HaikuStaticSite",
                BucketProps(
                    BlockPublicAccess = BlockPublicAccess.BLOCK_ALL,
                    RemovalPolicy = RemovalPolicy.RETAIN,
                    EnforceSSL = true
                )
            )

        // CloudFront Function: rewrites extensionless paths to /path/index.html,
        // matching Astro's static "directory" build output.
        let rewriteFunctionCode =
            "function handler(event) {\n"
            + "  var request = event.request;\n"
            + "  var uri = request.uri;\n"
            + "  if (uri.endsWith(\"/\")) {\n"
            + "    request.uri = uri + \"index.html\";\n"
            + "  } else if (uri.lastIndexOf(\".\") < uri.lastIndexOf(\"/\")) {\n"
            + "    request.uri = uri + \"/index.html\";\n"
            + "  }\n"
            + "  return request;\n"
            + "}"

        let rewriteFunction =
            Function(
                this,
                "HaikuUrlRewriteFn",
                FunctionProps(Code = FunctionCode.FromInline(rewriteFunctionCode), Runtime = FunctionRuntime.JS_2_0)
            )

        // No custom domain / ACM certificate here — the site owner maps their own
        // domain to the CloudFront distribution's default domain name at their DNS
        // registrar. This stack only needs to expose that domain name (see outputs).
        let distribution =
            Distribution(
                this,
                "HaikuDistribution",
                DistributionProps(
                    DefaultBehavior =
                        BehaviorOptions(
                            Origin = S3BucketOrigin.WithOriginAccessControl(bucket),
                            ViewerProtocolPolicy = ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                            CachePolicy = CachePolicy.CACHING_OPTIMIZED,
                            FunctionAssociations =
                                [| FunctionAssociation(
                                       Function = rewriteFunction,
                                       EventType = FunctionEventType.VIEWER_REQUEST
                                   ) |]
                        ),
                    DefaultRootObject = "index.html",
                    // S3 (via OAC) returns 403, not 404, for missing keys since
                    // ListBucket isn't granted — map both to the same 404 page.
                    ErrorResponses =
                        [| ErrorResponse(
                               HttpStatus = 403.,
                               ResponseHttpStatus = (Some 404. |> Option.toNullable),
                               ResponsePagePath = "/404/index.html"
                           )
                           ErrorResponse(
                               HttpStatus = 404.,
                               ResponseHttpStatus = (Some 404. |> Option.toNullable),
                               ResponsePagePath = "/404/index.html"
                           ) |]
                )
            )

        // Site-sync workflow needs to write/replace/delete objects (s3 sync --delete),
        // invalidate the distribution cache, and read this stack's own outputs
        // (to look up the bucket name / distribution id at deploy time) — nothing else.
        bucket.GrantReadWrite(siteDeployRole) |> ignore
        bucket.GrantDelete(siteDeployRole) |> ignore
        distribution.GrantCreateInvalidation(siteDeployRole) |> ignore

        siteDeployRole.AddToPolicy(
            PolicyStatement(
                PolicyStatementProps(
                    Effect = Effect.ALLOW,
                    Actions = [| "cloudformation:DescribeStacks" |],
                    Resources = [| this.StackId |]
                )
            )
        )
        |> ignore

        CfnOutput(this, "BucketName", CfnOutputProps(Value = bucket.BucketName, ExportName = "HaikuBucketName"))
        |> ignore

        CfnOutput(
            this,
            "GitHubActionsDeployRoleArn",
            CfnOutputProps(Value = deployRole.RoleArn, ExportName = "HaikuGitHubActionsDeployRoleArn")
        )
        |> ignore

        CfnOutput(
            this,
            "GitHubActionsSiteDeployRoleArn",
            CfnOutputProps(Value = siteDeployRole.RoleArn, ExportName = "HaikuGitHubActionsSiteDeployRoleArn")
        )
        |> ignore

        CfnOutput(
            this,
            "DistributionId",
            CfnOutputProps(Value = distribution.DistributionId, ExportName = "HaikuDistributionId")
        )
        |> ignore

        CfnOutput(
            this,
            "DistributionDomainName",
            CfnOutputProps(
                Value = distribution.DistributionDomainName,
                ExportName = "HaikuDistributionDomainName"
            )
        )
        |> ignore
