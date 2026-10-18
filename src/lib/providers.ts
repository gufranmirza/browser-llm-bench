const qwen = "providers/qwen-color.svg";
const meta = "providers/aa-meta.svg";
const huggingface = "providers/huggingface-color.svg";
const google = "providers/aa-google.svg";
const gemma = "providers/gemma-color.svg";
const mistral = "providers/aa-mistral.svg";
const alibaba = "providers/aa-alibaba.svg";
const microsoft = "providers/microsoft-color.svg";
const ibm = "providers/ibm.svg";
const cohere = "providers/cohere-color.svg";
const nvidia = "providers/nvidia-color.svg";
const liquid = "providers/liquid.svg";
const tii = "providers/tii-color.svg";
const ai21 = "providers/ai21-brand-color.svg";
const aya = "providers/aya-color.svg";
const ifm = "providers/aa-ifm.svg";
const ai9stars = "providers/aa-ai9stars.svg";
const openbmb = "providers/aa-openbmb.svg";
const inclusion = "providers/aa-inclusionai.jpg";
const nanbeige = "providers/aa-nanbeige.png";
const lg = "providers/aa-lg.png";
const ai2 = "providers/aa-ai2.svg";
const creators: Record<string, string> = {
  Alibaba: alibaba,
  Microsoft: microsoft,
  IBM: ibm,
  Cohere: cohere,
  NVIDIA: nvidia,
  "Liquid AI": liquid,
  "TII UAE": tii,
  "AI21 Labs": ai21,
  "Institute of Foundation Models": ifm,
  AI9Stars: ai9stars,
  OpenBMB: openbmb,
  InclusionAI: inclusion,
  Nanbeige: nanbeige,
  "LG AI Research": lg,
  "Allen Institute for AI": ai2,
  Meta: meta,
  "Hugging Face": huggingface,
  Google: google,
  Mistral: mistral,
  "Mistral AI": mistral,
};

export function providerIdentity(family: string, model?: string) {
  return model?.toLowerCase().includes("qwen")
    ? { src: qwen, name: "Qwen" }
    : model?.toLowerCase().includes("gemma")
      ? { src: gemma, name: "Gemma" }
      : model?.toLowerCase().includes("aya")
        ? { src: aya, name: "Aya" }
        : { src: creators[family], name: family };
}
