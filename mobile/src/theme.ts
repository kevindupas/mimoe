// Palette Clipd (teal), claire/sombre.
export const colors = {
  light: {
    bg: "#F5F5F7",
    surface: "#FFFFFF",
    surfaceAlt: "#F0F0F3",
    text: "#1D1D1F",
    textDim: "#6E6E73",
    textFaint: "#A1A1A6",
    accent: "#047A69",
    accentSoft: "rgba(4,122,105,0.10)",
    border: "#E4E4E7",
    danger: "#D70015",
  },
  dark: {
    bg: "#17181C",
    surface: "#202127",
    surfaceAlt: "#2A2B32",
    text: "#F2F2F5",
    textDim: "#A6A6B2",
    textFaint: "#79798A",
    accent: "#3FBFA8",
    accentSoft: "rgba(63,191,168,0.14)",
    border: "#33343D",
    danger: "#FF6B6B",
  },
};

export type Palette = typeof colors.light;
