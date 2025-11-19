export const ONE_DAY_IN_MS =  24 * 60 * 60 * 1000;

export const isWithinLastDay = (date: Date | undefined, now = new Date()) => {
  if (!date) {
    return false;
  }
  return now.getTime() - date.getTime() <= ONE_DAY_IN_MS;
};

export const cleanText = (text: string) =>
  text.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();

export const resolveTextField = (field: unknown): string => {
  if (!field) {
    return "";
  }
  if (typeof field === "string") {
    return field;
  }
  if (
    typeof field === "object" && "value" in field &&
    typeof (field as { value: unknown }).value === "string"
  ) {
    return (field as { value: string }).value;
  }
  return "";
};
