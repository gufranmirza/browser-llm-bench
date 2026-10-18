"use client";
import { Boxes } from "lucide-react";
import { assetUrl } from "../lib/urls";
const qwen = assetUrl("/providers/qwen-color.svg");
const meta = assetUrl("/providers/aa-meta.svg");
const huggingface = assetUrl("/providers/huggingface-color.svg");
const google = assetUrl("/providers/aa-google.svg");
const gemma = assetUrl("/providers/gemma-color.svg");
const mistral = assetUrl("/providers/aa-mistral.svg");
const alibaba = assetUrl("/providers/aa-alibaba.svg");
const microsoft = assetUrl("/providers/microsoft-color.svg");
const ibm = assetUrl("/providers/ibm.svg");
const cohere = assetUrl("/providers/cohere-color.svg");
const nvidia = assetUrl("/providers/nvidia-color.svg");
const liquid = assetUrl("/providers/liquid.svg");
const tii = assetUrl("/providers/tii-color.svg");
const ai21 = assetUrl("/providers/ai21-brand-color.svg");
const aya = assetUrl("/providers/aya-color.svg");
const ifm = assetUrl("/providers/aa-ifm.svg");
const ai9stars = assetUrl("/providers/aa-ai9stars.svg");
const openbmb = assetUrl("/providers/aa-openbmb.svg");
const inclusion = assetUrl("/providers/aa-inclusionai.jpg");
const nanbeige = assetUrl("/providers/aa-nanbeige.png");
const lg = assetUrl("/providers/aa-lg.png");
const ai2 = assetUrl("/providers/aa-ai2.svg");
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
export function ProviderLogo({
  family,
  model,
}: {
  family: string;
  model?: string;
}) {
  const brand = model?.toLowerCase().includes("qwen")
    ? { src: qwen, name: "Qwen" }
    : model?.toLowerCase().includes("gemma")
      ? { src: gemma, name: "Gemma" }
      : model?.toLowerCase().includes("aya")
        ? { src: aya, name: "Aya" }
        : { src: creators[family], name: family };
  return (
    <span className="lb-provider-logo" title={brand.name}>
      {brand.src ? (
        <img
          src={brand.src}
          alt={`${brand.name} logo`}
          width={24}
          height={24}
        />
      ) : (
        <Boxes size={22} aria-label={family} />
      )}
    </span>
  );
}
