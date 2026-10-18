import { assetUrl } from "../lib/urls";
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <img
      className="brand-mark"
      src={assetUrl("brand/logo.svg")}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}
