"use client";

import { Button, Flex, Slider, Text } from "@radix-ui/themes";
import { AVATAR_OUTPUT_SIZE } from "@repo/shared";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useT } from "@/lib/i18n";

interface Props {
  file: File;
  busy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSave: (blob: Blob) => void | Promise<void>;
}

const CANVAS_SIZE = 240;

export function AvatarEditPane({
  file,
  busy,
  errorMessage,
  onCancel,
  onSave,
}: Props) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [minScale, setMinScale] = useState(1);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    setImgReady(false);
    setImgError(null);
    img.onload = () => {
      imgRef.current = img;
      const minFit =
        Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height) || 1;
      setMinScale(minFit);
      setScale(minFit);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setImgReady(true);
    };
    img.onerror = () => {
      setImgError(t("avatar.errorRead"));
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, t]);

  const draw = useCallback(
    (canvas: HTMLCanvasElement, size: number) => {
      const img = imgRef.current;
      if (!img) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const ratio = size / CANVAS_SIZE;
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, size, size);
      ctx.translate(size / 2 + offset.x * ratio, size / 2 + offset.y * ratio);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(scale * ratio, scale * ratio);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    },
    [offset.x, offset.y, rotation, scale],
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgReady) return;
    draw(canvas, CANVAS_SIZE);
  }, [draw, imgReady]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.ox + (e.clientX - drag.x),
      y: drag.oy + (e.clientY - drag.y),
    });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const delta = -e.deltaY * 0.0015;
    setScale((s) => clamp(s * (1 + delta), minScale, minScale * 6));
  };

  const handleSave = async () => {
    if (!imgRef.current) return;
    const offCanvas = document.createElement("canvas");
    offCanvas.width = AVATAR_OUTPUT_SIZE;
    offCanvas.height = AVATAR_OUTPUT_SIZE;
    draw(offCanvas, AVATAR_OUTPUT_SIZE);
    const blob: Blob | null = await new Promise((resolve) =>
      offCanvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return;
    await onSave(blob);
  };

  return (
    <Flex direction="column" gap="3" style={{ width: 280 }}>
      <Text size="2" weight="medium">
        {t("avatar.cropAndRotate")}
      </Text>

      <Flex justify="center">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="avatar-edit-canvas"
          style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        />
      </Flex>

      {imgError && (
        <Text size="1" color="red">
          {imgError}
        </Text>
      )}

      <Flex direction="column" gap="1">
        <Text size="1" color="gray">
          {t("avatar.zoom")}
        </Text>
        <Slider
          value={[scale]}
          min={minScale}
          max={minScale * 6}
          step={0.01}
          onValueChange={(v) => setScale(v[0] ?? minScale)}
          disabled={!imgReady || busy}
        />
      </Flex>

      <Flex direction="column" gap="1">
        <Flex justify="between" align="center">
          <Text size="1" color="gray">
            {t("avatar.rotate")}
          </Text>
          <Text size="1" color="gray">
            {Math.round(rotation)}°
          </Text>
        </Flex>
        <Slider
          value={[rotation]}
          min={-180}
          max={180}
          step={1}
          onValueChange={(v) => setRotation(v[0] ?? 0)}
          disabled={!imgReady || busy}
        />
        <Flex gap="2" mt="1">
          <Button
            size="1"
            variant="soft"
            color="gray"
            onClick={() => setRotation((r) => r - 90)}
            disabled={!imgReady || busy}
          >
            ↺ 90°
          </Button>
          <Button
            size="1"
            variant="soft"
            color="gray"
            onClick={() => setRotation((r) => r + 90)}
            disabled={!imgReady || busy}
          >
            ↻ 90°
          </Button>
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={() => setRotation(0)}
            disabled={!imgReady || busy}
          >
            {t("common.reset")}
          </Button>
        </Flex>
      </Flex>

      {errorMessage && (
        <Text size="1" color="red">
          {errorMessage}
        </Text>
      )}

      <Flex gap="2" justify="end">
        <Button variant="soft" color="gray" onClick={onCancel} disabled={busy}>
          {t("common.back")}
        </Button>
        <Button onClick={handleSave} disabled={!imgReady || busy}>
          {busy ? t("common.saving") : t("avatar.saveButton")}
        </Button>
      </Flex>
    </Flex>
  );
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
