import { runCli } from "../../../plugins/nacl/runtime/graph-cli/cli.mjs";
import { keychainReference } from "../../../plugins/nacl/runtime/graph-cli/contracts.mjs";
import { MemorySecretProvider } from "../../../plugins/nacl/runtime/graph-cli/secret-provider.mjs";

const projectIndex = process.argv.indexOf("--project-id");
const projectId = projectIndex >= 0 ? process.argv[projectIndex + 1] : "";
const secret = process.env.NACL_TEST_GRAPH_SECRET;
const secretProvider = new MemorySecretProvider(
  projectId && secret ? { [keychainReference(projectId)]: secret } : {},
);
delete process.env.NACL_TEST_GRAPH_SECRET;
const outcome = await runCli({
  argv: process.argv.slice(2),
  lifecycleOptions: { secretProvider },
});
process.exitCode = outcome.exitCode;
