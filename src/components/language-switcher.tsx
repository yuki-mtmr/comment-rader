"use client";

import { useLanguage } from "@/lib/i18n/context";
import { Button } from "./ui/button";

export function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage();

    return (
        <div className="flex items-center gap-2">
            <Button
                variant={language === "ja" ? "default" : "outline"}
                size="sm"
                onClick={() => setLanguage("ja")}
                className={language === "ja" ? "bg-primary/20 text-primary border-primary/50" : "glass-dark border-white/10"}
            >
                JP
            </Button>
            <Button
                variant={language === "en" ? "default" : "outline"}
                size="sm"
                onClick={() => setLanguage("en")}
                className={language === "en" ? "bg-primary/20 text-primary border-primary/50" : "glass-dark border-white/10"}
            >
                EN
            </Button>
        </div>
    );
}
