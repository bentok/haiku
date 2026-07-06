module HaikuApp

open Amazon.CDK
open HaikuStack

[<EntryPoint>]
let main _ =
    let app = App()
    let accountNumber = System.Environment.GetEnvironmentVariable("AWS_CLOUDFORMATION_ACCOUNT_NUMBER")
    let region = System.Environment.GetEnvironmentVariable("AWS_DEFAULT_REGION")

    HaikuStack(
        app,
        "HaikuStack",
        StackProps(Env = Environment(Account = accountNumber, Region = region))
    )
    |> ignore

    app.Synth() |> ignore

    0
