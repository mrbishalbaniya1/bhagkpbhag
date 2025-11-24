"use client";

import { useEffect, useState } from 'react';

type Theme = "theme-morning" | "theme-evening" | "theme-night" | "";

function getTheme(): Theme {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
        return "theme-morning";
    } else if (hour >= 12 && hour < 18) {
        // Default afternoon/day theme (no class)
        return "";
    } else if (hour >= 18 && hour < 21) {
        return "theme-evening";
    } else {
        return "theme-night";
    }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>("");

    useEffect(() => {
        // Set theme on initial client render
        const currentTheme = getTheme();
        setTheme(currentTheme);

        // Optional: Update theme every minute if you want it to change without a page refresh
        const interval = setInterval(() => {
            const newTheme = getTheme();
            if (newTheme !== theme) {
                setTheme(newTheme);
            }
        }, 60000);

        return () => clearInterval(interval);
    }, [theme]);
    
    useEffect(() => {
        document.body.classList.remove("theme-morning", "theme-evening", "theme-night");
        if (theme) {
            document.body.classList.add(theme);
        }
    }, [theme]);

    return <>{children}</>;
}
