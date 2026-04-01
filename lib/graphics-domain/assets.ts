export type GraphicsPreviewShape = "square" | "wide" | "tall";
export type GraphicsBackgroundImageSize = "1024x1024" | "1536x1024" | "1024x1536";

export const GRAPHICS_BACKGROUND_IMAGE_SIZE_BY_SHAPE: Record<GraphicsPreviewShape, GraphicsBackgroundImageSize> = {
  square: "1024x1024",
  wide: "1536x1024",
  tall: "1024x1536"
};

export function resolveGraphicsBackgroundImageSize(shape: GraphicsPreviewShape): GraphicsBackgroundImageSize {
  return GRAPHICS_BACKGROUND_IMAGE_SIZE_BY_SHAPE[shape];
}
