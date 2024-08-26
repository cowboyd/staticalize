import { call, type Operation, resource } from "effection";
import { $, type ProcessOutput } from "npm:zx";

export function exec(command: string): Operation<ProcessOutput> {
  return resource(function* (provide) {
    //@ts-expect-error TemplateStringsArray is weird
    let process = $([command]);
    try {
      yield* provide(yield* call(() => process));
    } finally {
      yield* call(async () => {
        await process.kill();
        await process;
      });
    }
  });
}
