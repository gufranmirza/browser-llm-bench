export const workloadOptions = [
  {
    id: "short",
    name: "Short prompt",
    detail: "One short prompt; output limit is configurable",
  },
  {
    id: "long-input",
    name: "Long prompt",
    detail: "Summarize a longer passage",
  },
  {
    id: "long-output",
    name: "Long response",
    detail: "Short prompt with a larger default output limit",
  },
  {
    id: "repeat",
    name: "Repeated requests",
    detail: "Repeat the same prompt using a counted or timed schedule",
  },
  {
    id: "context",
    name: "Context sweep",
    detail: "Three prompts with increasing input lengths",
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
