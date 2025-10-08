"use client";

import { useEffect, useState } from "react";
import { useLoading } from "../lib/loading-context";

export default function LoadingBar() {
  const [showBar, setShowBar] = useState(false);
  const { isLoading } = useLoading();

  useEffect(() => {
    let showTimer: NodeJS.Timeout;
    
    if (isLoading) {
      // start a timer to show loading bar only if it takes longer than 500ms
      showTimer = setTimeout(() => {
        setShowBar(true);
      }, 500);
    } else {
      setShowBar(false);
    }

    return () => {
      clearTimeout(showTimer);
    };
  }, [isLoading]);

  if (!showBar) return null;

  return (
    <div className="fixed top-[64px] left-[64px] right-0 h-1 bg-transparent z-40 overflow-hidden">
      <div 
        className="h-full w-full bg-gradient-to-r from-accent-light to-accent-dark rounded-full"
        style={{
          animation: "loadingBar 1.5s ease-in-out infinite"
        }}
      />
    </div>
  );
}
