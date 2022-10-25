export type Logger = {
  (
    message: Stringable,
    fields?: { [key: string]: Stringable },
    ...tags: Stringable[]
  ): void;
  tag: (...tags: Stringable[]) => Logger;
};
export type Stringable = string | ToString;
export type ToString = {
  toString: () => string;
};
function fieldsToString(fields?: { [key: string]: Stringable }) {
  if (!fields) {
    return "";
  }
  let str = "";
  for (const k in fields) {
    str = str + k + ":" + fields[k].toString() + ", ";
  }
  return str;
}

export const NewMockLogger = (...tags: Stringable[]): Logger => {
  let oldTags: Stringable[] = tags;
  const log: Logger = function (
    message: Stringable,
    fields?: { [key: string]: Stringable },
    ...tags: Stringable[]
  ) {
    const allTags = [...oldTags, ...tags];
    console.log(
      `tags: ${allTags.join(
        "|"
      )}, message: ${message}, fields: ${fieldsToString(fields)}`
    );
  };
  log.tag = (...tags: Stringable[]) => {
    oldTags.push(...tags);
    return log;
  };
  return log;
};
