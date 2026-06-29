"use client";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("growthip:theme");
    if (saved === "dark") {
      setDark(true);
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("growthip:theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("growthip:theme", "light");
    }
  }

  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 40, height: 40, borderRadius: "10px",
        border: "1px solid #E5E5E5",
        background: dark ? "#1A1A1A" : "#F5F5F5",
        cursor: "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
        transition: "all 0.3s ease",
      }}
    >
      {dark ? (
        <Icon
          icon="ph:moon-stars-bold"
          className="theme-toggle-moon"
          style={{ fontSize: "18px", color: "#A3A3A3" }}
        />
      ) : (
        <Icon
          icon="ph:sun-bold"
          className="theme-toggle-sun"
          style={{ fontSize: "18px", color: "#F59E0B" }}
        />
      )}
    </button>
  );
}
