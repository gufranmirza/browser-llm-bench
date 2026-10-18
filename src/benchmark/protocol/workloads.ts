export const workloadOptions = [
  {
    id: "short",
    name: "Short exchange",
    detail: "Short input · up to 64 output tokens",
  },
  {
    id: "long-input",
    name: "Read & respond",
    detail: "Longer input · up to 64 output tokens",
  },
  {
    id: "long-output",
    name: "Sustained generation",
    detail: "Short input · up to 256 output tokens",
  },
  {
    id: "repeat",
    name: "Repeated requests",
    detail:
      "Counted or timed requests, including the 60-request comparison session",
  },
  {
    id: "context",
    name: "Context sweep",
    detail: "3 increasing prompts · 64 output tokens each",
  },
];
const short =
  "In three short sentences, explain why leaves change color in autumn.";
const passage =
  "A browser runs a language model on the local device. Model weights are downloaded once and may be cached. The browser prepares the model, processes the prompt, and generates a response. Device capabilities, available memory, and competing work affect the experience. ";
export function workload(id: string) {
  return id === "long-input"
    ? [passage.repeat(18) + "Summarize the passage in two sentences."]
    : id === "long-output"
      ? [
          "Write a detailed explanation of the water cycle for a curious student.",
        ]
      : id === "repeat"
        ? [short, short, short]
        : id === "context"
          ? [1, 8, 24].map(
              (x) => passage.repeat(x) + "Summarize in one sentence.",
            )
          : [short];
}
