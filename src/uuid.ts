export interface UUID {
  NewUUID: () => string;
}

export const MockUUIDGen = {
  NewUUID: () => {
    return "AAAA";
  },
};
