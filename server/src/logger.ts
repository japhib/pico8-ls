// eslint-disable-next-line @typescript-eslint/no-empty-function
let logger: (msg: string) => void = (msg) => {
  console.log(msg);
};

export function setLogger(logFn: (msg: string) => void) {
  logger = logFn;
}

export function log(msg: string) {
  logger(msg);
}
