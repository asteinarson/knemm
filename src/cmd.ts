import Command from "commander";

let cmd = Command;

cmd.command("fulfills <target> <candidate>")
    .description(
        "See if <candidate> fulfills <target>"
    )
    .action((target,candidate,options) => {
        console.log("init");
        process.exit(1);
    });

cmd.command("diff <target> <candidate>")
    .description(
        "Show diff beteen <candidate> and <target>"
    )
    .action((target,candidate,options) => {
        console.log("init");
        process.exit(1);
    });

cmd.command("apply <target> <DB>")
    .description(
        "Apply target on DB"
    )
    .action((target,DB,options) => {
        console.log("init");
        process.exit(1);
    });

cmd.command("reverse <target> <DB>")
    .description(
        "Apply target on DB"
    )
    .action((target,DB,options) => {
        console.log("init");
        process.exit(1);
    });

cmd.parse(process.argv);
