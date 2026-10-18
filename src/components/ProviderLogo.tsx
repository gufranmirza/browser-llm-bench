import { Boxes } from "lucide-react";
import { providerIdentity } from "../lib/providers";
import { assetUrl } from "../lib/urls";
export function ProviderLogo({
  family,
  model,
}: {
  family: string;
  model?: string;
}) {
  const brand = providerIdentity(family, model);
  return (
    <span className="lb-provider-logo" title={brand.name}>
      {brand.src ? (
        <img
          src={assetUrl(brand.src)}
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
