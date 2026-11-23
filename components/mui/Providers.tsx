"use client";
// Material UI, used only for dropdowns and calendars. The theme borrows the app's own CSS variables (colours, radius, shadow, font), so the pieces look like the rest of the
// app and follow its light/dark switch: that switch sets data-theme on <html>, which is also the selector MUI's colour schemes hang on.
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import type {} from "@mui/x-date-pickers/themeAugmentation"; // lets the theme style the pickers (MuiPickerPopper, ...)
import "dayjs/locale/en-gb"; // dates read DD/MM/YYYY, the way the rest of the app writes them

const paper = { backgroundColor: "var(--surface)", backgroundImage: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-lift)", color: "var(--text)" };

const theme = createTheme({
  cssVariables: { colorSchemeSelector: '[data-theme="%s"]' },
  colorSchemes: {
    light: { palette: { primary: { main: "#5b4ef5" }, background: { default: "#fbfbf9", paper: "#ffffff" }, text: { primary: "#121216", secondary: "#3a3a44" }, divider: "#e6e5e0" } },
    dark: { palette: { primary: { main: "#9a90ff" }, background: { default: "#0d0d10", paper: "#131317" }, text: { primary: "#f1f1f4", secondary: "#c9c9d2" }, divider: "#222228" } },
  },
  typography: { fontFamily: "var(--font-ui)", fontSize: 13.5 },
  shape: { borderRadius: 10 },
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: "var(--surface)", borderRadius: "var(--radius-sm)", fontSize: "inherit", "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "color-mix(in srgb, var(--accent) 30%, var(--border-strong))" }, "&.Mui-focused": { boxShadow: "var(--ring)" }, "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "var(--accent)", borderWidth: 1 } },
        notchedOutline: { borderColor: "var(--border-strong)" },
      },
    },
    MuiSelect: { styleOverrides: { icon: { color: "var(--muted)" } } },
    MuiMenu: { styleOverrides: { paper } },
    MuiMenuItem: { styleOverrides: { root: { fontSize: "13.5px", minHeight: 36, "&.Mui-selected": { backgroundColor: "var(--accent-weak)", color: "var(--accent)" }, "&.Mui-selected:hover": { backgroundColor: "var(--accent-weak)" } } } },
    MuiPickerPopper: { styleOverrides: { paper } },
    MuiPickerDay: { styleOverrides: { root: { fontSize: "13px" } } },
    MuiIconButton: { styleOverrides: { root: { color: "var(--muted)" } } },
  },
});

// modeStorageKey "theme" is the same key the app's own switch stores "light"/"dark" under, so MUI and the app never disagree about the theme.
export default function MuiProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme} defaultMode="system" modeStorageKey="theme">
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">{children}</LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
