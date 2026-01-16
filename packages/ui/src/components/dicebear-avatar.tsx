import { useEffect, useState, useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { glass } from "@dicebear/collection";
import { cn } from "@workspace/ui/lib/utils";

interface DicebearAvatarProps {
  seed: string;
  size?: number;
  className?: string;
  badgeClassName?: string;
  imageUrl?: string | null;
  badgeImageUrl?: string | null;
}

export const DicebearAvatar = ({
  seed,
  size = 32,
  className,
  imageUrl,
  badgeClassName,
  badgeImageUrl,
}: DicebearAvatarProps) => {
  const [imgError, setImgError] = useState(false);

  const fallbackSrc = useMemo(() => {
    const avatar = createAvatar(glass, {
      seed: seed.toLowerCase().trim(),
      size,
    });
    return avatar.toDataUri();
  }, [seed, size]);

  const shouldUsePhoto = Boolean(imageUrl && !imgError);
  const src = shouldUsePhoto ? (imageUrl as string) : fallbackSrc;

  const badgeSize = Math.round(size * 0.5);

  return (
    <div
      className={cn("relative inline-block", className)}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt="Avatar"
        width={size}
        height={size}
        className="h-full w-full rounded-full border object-cover bg-muted"
        referrerPolicy="no-referrer"
        onError={() => {
          setImgError(true);
        }}
      />

      {badgeImageUrl && (
        <div
          className={cn(
            "absolute right-0 bottom-0 flex items-center justify-center overflow-hidden rounded-full border-2 border-background bg-background",
            badgeClassName
          )}
          style={{
            width: badgeSize,
            height: badgeSize,
            transform: "translate(15%, 15%)",
          }}
        >
          <img
            alt="Badge"
            className="h-full w-full object-cover"
            height={badgeSize}
            src={badgeImageUrl as string}
            width={badgeSize}
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
};
