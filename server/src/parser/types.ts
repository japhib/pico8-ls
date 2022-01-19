export type Location_ = {
  line: number,
  column: number,
};

export type LocationExt = {
  line: number,
  column: number,
  index: number,
};

export type Bounds = {
  start: Location_,
  end: Location_,
};

export type Range_ = [begin: number, end: number];

export type Node_ = {
  loc?: Bounds,
  range?: Range_,
};
