import {
  action,
  createSignal,
  Err,
  Ok,
  Operation,
  Resolve,
  resource,
  Result,
  sleep,
  spawn,
  Task,
  useScope,
} from "effection";

export interface TaskBuffer extends Operation<void> {
  spawn<T>(op: () => Operation<T>): Operation<Task<T>>;
}

export function useTaskBuffer(max: number): Operation<TaskBuffer> {
  return resource(function* (provide) {
    let input = createSignal<SpawnRequest<unknown>, never>();

    let output = createSignal<Result<unknown>, never>();

    let buffer = new Set<Task<unknown>>();

    let scope = yield* useScope();

    let requests = yield* input;

    yield* spawn(function* () {
      while (true) {
        if (buffer.size < max) {
          let { value: request } = yield* requests.next();
          yield* sleep(0);
          let task = scope.run(request.operation);
          buffer.add(task);
          yield* spawn(function* () {
            try {
              output.send(Ok(yield* task));
            } catch (error) {
              output.send(Err(error));
            } finally {
              buffer.delete(task);
            }
          });
          request.resolve(task);
        } else {
          yield* (yield* output).next();
        }
      }
    });

    yield* provide({
      *[Symbol.iterator]() {
        while (buffer.size > 0) {
          for (let task of buffer.values()) {
            yield* task;
          }
        }
      },
      spawn: (operation) =>
        action(function* (resolve) {
          input.send({ operation, resolve: resolve as Resolve<Task<unknown>> });
        }),
    });
  });
}

interface SpawnRequest<T> {
  operation(): Operation<T>;
  resolve: Resolve<Task<T>>;
}
