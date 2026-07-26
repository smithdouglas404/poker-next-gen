import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import { useSoundEngine } from "@/lib/sound-context";
import { useGameUI } from "@/lib/game-ui-context";
import { Minus, Plus } from "lucide-react";

interface ControlsProps {
  onAction: (action: string, amount?: number) => void;
  minBet: number;
  maxBet: number;
  callCost?: number;
  pot?: number;
  phase?: string;
  currentTurnSeat?: number;
  isHeroTurn?: boolean;
  onBuyTime?: () => void;
  bigBlind?: number;
  heroTimeLeft?: number;
  heroStatus?: string;
  heroCardsSlot?: ReactNode;
  handBadgeSlot?: ReactNode;
}

export function PokerControls({ onAction, minBet, maxBet, callCost, pot = 0, phase, currentTurnSeat, isHeroTurn, onBuyTime, bigBlind, heroTimeLeft, heroStatus, heroCardsSlot, handBadgeSlot }: ControlsProps) {
  const [betAmount, setBetAmount] = useState(minBet);
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);
  useEffect(() => {
    setBetAmount(prev => prev < minBet ? minBet : prev);
  }, [minBet]);
  const [isPending, setIsPending] = useState(false);
  const [foldConfirm, setFoldConfirm] = useState(false);
  const [kbFlash, setKbFlash] = useState<string | null>(null);
  const [autoFold, setAutoFold] = useState(false);
  const [autoCheckFold, setAutoCheckFold] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputValue, setCustomInputValue] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);
  const foldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sound = useSoundEngine();
  let compactMode = false;
  try { compactMode = useGameUI().compactMode; } catch {}

  const isPreFlop = phase === "pre-flop";
  const bb = bigBlind || 1;
  const needsToCall = (callCost ?? 0) > 0;
  const callAmount = callCost ?? 0;
  const buttonsDisabled = isPending || !isHeroTurn;

  const autoFoldTriggeredRef = useRef(false);
  useEffect(() => {
    if (!isHeroTurn || isPending) return;
    if (autoFold) {
      autoFoldTriggeredRef.current = true;
      setAutoFold(false);
      setIsPending(true);
      sound.playFold();
      sound.stopBgm();
      onAction("fold");
    } else if (autoCheckFold) {
      autoFoldTriggeredRef.current = true;
      setAutoCheckFold(false);
      if (!needsToCall) {
        setIsPending(true);
        sound.playCheck();
        onAction("check");
      } else {
        setIsPending(true);
        sound.playFold();
        sound.stopBgm();
        onAction("fold");
      }
    }
  }, [isHeroTurn, autoFold, autoCheckFold, needsToCall, isPending, sound, onAction]);

  useEffect(() => {
    setIsPending(false);
    setFoldConfirm(false);
    setShowCustomInput(false);
    setShowRaiseSlider(true);
    setBetAmount(minBet);
  }, [phase, currentTurnSeat, minBet]);

  const sliderStep = Math.max(1, Math.floor(bb)) || 1;
  const potRaiseTotal = Math.min(Math.max(pot + callAmount * 2, minBet), maxBet);
  const clamp = (v: number) => Math.min(Math.max(Math.round(v), minBet), maxBet);

  const presets = isPreFlop
    ? [
        { label: "2x", value: clamp(bb * 2), tooltip: "Min-raise (2x BB)" },
        { label: "2.5x", value: clamp(bb * 2.5), tooltip: "Standard open raise" },
        { label: "3x", value: clamp(bb * 3), tooltip: "Classic 3x BB raise" },
        { label: "Pot", value: potRaiseTotal, tooltip: "Pot-sized raise" },
      ]
    : [
        { label: "33%", value: clamp(pot * 0.33), tooltip: "Small c-bet or thin value" },
        { label: "50%", value: clamp(pot * 0.5), tooltip: "Standard balanced sizing" },
        { label: "75%", value: clamp(pot * 0.75), tooltip: "Charge draws, build pot" },
        { label: "Pot", value: potRaiseTotal, tooltip: "Polarized: nuts or bluff" },
      ];

  const handlePreset = useCallback((value: number) => {
    setBetAmount(value);
    setShowCustomInput(false);
  }, []);

  const handleCustomAmount = useCallback(() => {
    const val = parseInt(customInputValue, 10);
    if (!isNaN(val) && val >= minBet && val <= maxBet) {
      setBetAmount(val);
      setShowCustomInput(false);
    }
  }, [customInputValue, minBet, maxBet]);

  const handleFold = useCallback(() => {
    if (isPending) return;
    setIsPending(true);
    setFoldConfirm(false);
    sound.playFold();
    sound.stopBgm();
    onAction("fold");
  }, [sound, onAction, isPending]);

  const handleFoldKeyboard = useCallback(() => {
    if (isPending) return;
    if (foldConfirm) {
      handleFold();
    } else {
      setFoldConfirm(true);
      if (foldTimerRef.current) clearTimeout(foldTimerRef.current);
      foldTimerRef.current = setTimeout(() => setFoldConfirm(false), 2000);
    }
  }, [isPending, foldConfirm, handleFold]);

  const handleCheck = useCallback(() => {
    if (isPending) return;
    setIsPending(true);
    sound.playCheck();
    onAction("check");
  }, [sound, onAction, isPending]);

  const handleCall = useCallback(() => {
    if (isPending) return;
    setIsPending(true);
    sound.playCall();
    sound.playChipSlide();
    onAction("call");
  }, [sound, onAction, isPending]);

  const handleRaise = useCallback(() => {
    if (isPending) return;
    setIsPending(true);
    sound.playRaise();
    sound.playChipSlide();
    onAction("raise", betAmount);
  }, [sound, onAction, betAmount, isPending]);

  const handleAllIn = useCallback(() => {
    if (isPending) return;
    setIsPending(true);
    sound.playRaise();
    sound.playChipSlide();
    onAction("raise", maxBet);
  }, [sound, onAction, maxBet, isPending]);

  const isAllIn = betAmount >= maxBet;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isPending || !isHeroTurn) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key.toLowerCase()) {
        case "f":
          setKbFlash("fold"); setTimeout(() => setKbFlash(null), 150);
          handleFoldKeyboard();
          break;
        case "c":
          setKbFlash("call"); setTimeout(() => setKbFlash(null), 150);
          if (needsToCall) handleCall();
          else handleCheck();
          break;
        case "r":
          setKbFlash("raise"); setTimeout(() => setKbFlash(null), 150);
          if (isAllIn) handleAllIn();
          else handleRaise();
          break;
        case "a":
          setKbFlash("raise"); setTimeout(() => setKbFlash(null), 150);
          handleAllIn();
          break;
        case "escape":
          setShowRaiseSlider(false);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPending, needsToCall, isAllIn, showRaiseSlider, handleFoldKeyboard, handleCall, handleCheck, handleRaise, handleAllIn]);

  useEffect(() => {
    return () => { if (foldTimerRef.current) clearTimeout(foldTimerRef.current); };
  }, []);

  useEffect(() => {
    if (showCustomInput && customInputRef.current) {
      customInputRef.current.focus();
      setCustomInputValue(String(betAmount));
    }
  }, [showCustomInput, betAmount]);

  const stepDown = () => setBetAmount(prev => Math.max(minBet, prev - sliderStep));
  const stepUp = () => setBetAmount(prev => Math.min(maxBet, prev + sliderStep));

  const timerPct = heroTimeLeft ?? 100;
  const timerColor = timerPct > 50 ? "#d4af37" : timerPct > 25 ? "#f59e0b" : "#ef4444";
  const timerUrgent = timerPct <= 25;

  return (
    <motion.div
      initial={compactMode ? { y: 0, opacity: 1 } : { y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={compactMode ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 25 }}
      className="relative z-50"
      data-testid="poker-controls"
    >
      {/* Timer bar */}
      {isHeroTurn && (
        <div className="h-[4px] w-full overflow-hidden" style={{ background: "rgba(0,0,0,0.6)" }}>
          <motion.div
            className="h-full"
            style={{
              background: `linear-gradient(90deg, ${timerColor}, ${timerColor}dd)`,
              boxShadow: `0 0 12px ${timerColor}, 0 0 4px ${timerColor}`,
            }}
            initial={{ width: "100%" }}
            animate={{ width: `${timerPct}%` }}
            transition={{ duration: 0.5, ease: "linear" }}
          />
        </div>
      )}

      {/* Gradient fade from table */}
      <div className="h-3 bg-gradient-to-t from-[rgba(15,15,20,0.4)] to-transparent pointer-events-none" />

      {/* Main controls container — glass-morphic */}
      <div
        className="px-4 pb-3 pt-1.5 border-t border-white/[0.06]"
        style={{
          background: "rgba(15, 15, 20, 0.92)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          boxShadow: "0 -4px 30px rgba(0,0,0,0.3)",
        }}
      >
        <div className="max-w-5xl mx-auto flex flex-col gap-2">

          {/* === ROW 1: Bet Slider === */}
          <AnimatePresence>
            {(showRaiseSlider || isHeroTurn) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className={`flex items-center gap-2 transition-opacity duration-200 ${!isHeroTurn ? "opacity-25 pointer-events-none" : ""}`}>

                  {/* Stepper - */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={stepDown}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-amber-300/80 hover:text-amber-200 transition-all shrink-0"
                    style={{
                      background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%)",
                      border: "1px solid rgba(212,175,55,0.2)",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    }}
                    data-testid="bet-minus"
                  >
                    <Minus className="w-4 h-4" />
                  </motion.button>

                  {/* Slider */}
                  <div className="flex-1 relative px-1">
                    <Slider
                      value={[betAmount]}
                      max={maxBet}
                      min={minBet}
                      step={sliderStep}
                      onValueChange={(val) => { setBetAmount(val[0]); setShowCustomInput(false); }}
                      className="flex-1"
                      data-testid="bet-slider"
                    />
                    <div className="flex justify-between mt-0.5 px-0.5">
                      <span className="text-[0.65rem] font-mono text-amber-300/80 font-bold">${minBet.toLocaleString()}</span>
                      <span className="text-[0.65rem] font-mono text-amber-300/80 font-bold">${maxBet.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Stepper + */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={stepUp}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-amber-300/80 hover:text-amber-200 transition-all shrink-0"
                    style={{
                      background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%)",
                      border: "1px solid rgba(212,175,55,0.2)",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    }}
                    data-testid="bet-plus"
                  >
                    <Plus className="w-4 h-4" />
                  </motion.button>

                  {/* Bet amount display / custom input */}
                  <div className="relative shrink-0">
                    {showCustomInput ? (
                      <div className="flex items-center gap-1">
                        <span className="text-lg font-mono text-amber-400 font-black">$</span>
                        <input
                          ref={customInputRef}
                          type="number"
                          value={customInputValue}
                          onChange={(e) => setCustomInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCustomAmount();
                            if (e.key === "Escape") setShowCustomInput(false);
                          }}
                          onBlur={handleCustomAmount}
                          min={minBet}
                          max={maxBet}
                          data-testid="custom-bet-input"
                          className="w-28 rounded-xl px-3 py-2.5 text-base font-mono font-black text-amber-300 bg-amber-500/10 border-2 border-amber-500/40 outline-none focus:border-amber-400/70"
                          style={{ appearance: "textfield" }}
                        />
                      </div>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setShowCustomInput(true)}
                        data-testid="bet-amount-display"
                        className="rounded-lg min-w-[90px] text-center cursor-text transition-all"
                        title="Click to type a custom amount"
                        style={{
                          padding: "0.4rem 0.875rem",
                          background: "linear-gradient(180deg, rgba(212,175,55,0.12) 0%, rgba(139,105,20,0.08) 100%)",
                          border: "1.5px solid rgba(212,175,55,0.3)",
                          boxShadow: "0 0 12px rgba(212,175,55,0.1), inset 0 1px 0 rgba(212,175,55,0.05)",
                        }}
                      >
                        <span
                          className="text-base font-mono font-black text-amber-200"
                          style={{ textShadow: "0 0 10px rgba(212,175,55,0.4)" }}
                        >
                          ${betAmount.toLocaleString()}
                        </span>
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* === ROW 2: Hero cards + Presets + Action Buttons === */}
          <div className="flex items-center gap-4">

            {/* Hero cards + hand badge */}
            {heroCardsSlot && (
              <div className="flex items-center gap-2 shrink-0">
                {heroCardsSlot}
                {handBadgeSlot}
              </div>
            )}

            {/* Center column: Presets + Action buttons + Auto toggles */}
            <div className="flex flex-col items-center gap-1.5 flex-1">

              {/* Preset chips (above action buttons) */}
              {(showRaiseSlider || isHeroTurn) && (
                <div className={`flex gap-1.5 transition-opacity duration-200 ${!isHeroTurn ? "opacity-25 pointer-events-none" : ""}`}>
                  {presets.map((p) => {
                    const isActive = betAmount === p.value;
                    return (
                      <motion.button
                        key={p.label}
                        whileHover={{ scale: 1.06, y: -1 }}
                        whileTap={{ scale: 0.93 }}
                        onClick={() => handlePreset(p.value)}
                        title={p.tooltip}
                        data-testid={`preset-${p.label.toLowerCase()}`}
                        className="relative overflow-hidden rounded-lg text-[0.75rem] font-black uppercase tracking-wide transition-all"
                        style={{
                          padding: "0.4rem 0.75rem",
                          color: isActive ? "#b5f5ff" : "#e5e7eb",
                          background: isActive
                            ? "linear-gradient(180deg, rgba(212,175,55,0.25) 0%, rgba(139,105,20,0.2) 100%)"
                            : "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                          border: isActive ? "1.5px solid rgba(212,175,55,0.5)" : "1px solid rgba(255,255,255,0.15)",
                          boxShadow: isActive
                            ? "0 0 16px rgba(212,175,55,0.25), inset 0 1px 0 rgba(212,175,55,0.15)"
                            : "0 2px 4px rgba(0,0,0,0.3)",
                        }}
                      >
                        {isActive && <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent" />}
                        <span className="relative">{p.label}</span>
                      </motion.button>
                    );
                  })}

                  {/* ALL-IN preset */}
                  <motion.button
                    whileHover={{ scale: 1.06, y: -1 }}
                    whileTap={{ scale: 0.93 }}
                    onClick={() => handlePreset(maxBet)}
                    title="Shove your entire stack"
                    data-testid="preset-allin"
                    className="relative overflow-hidden rounded-lg text-[0.75rem] font-black uppercase tracking-wide transition-all"
                    style={{
                      padding: "0.4rem 0.75rem",
                      color: betAmount === maxBet ? "#fde68a" : "#e5e7eb",
                      background: betAmount === maxBet
                        ? "linear-gradient(180deg, rgba(245,158,11,0.3) 0%, rgba(180,83,9,0.2) 100%)"
                        : "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                      border: betAmount === maxBet ? "1.5px solid rgba(245,158,11,0.5)" : "1px solid rgba(255,255,255,0.15)",
                      boxShadow: betAmount === maxBet
                        ? "0 0 16px rgba(245,158,11,0.25), inset 0 1px 0 rgba(245,158,11,0.15)"
                        : "0 2px 4px rgba(0,0,0,0.3)",
                    }}
                  >
                    {betAmount === maxBet && <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent" />}
                    <span className="relative">ALL IN</span>
                  </motion.button>
                </div>
              )}

              {/* Action buttons */}
              <div className={`flex items-center gap-3 transition-all duration-200 ${!isHeroTurn ? "opacity-35 grayscale pointer-events-none" : ""}`}>

                {/* FOLD */}
                <motion.button
                  whileHover={buttonsDisabled ? {} : { scale: 1.05, y: -2 }}
                  whileTap={buttonsDisabled ? {} : { scale: 0.93 }}
                  onClick={handleFold}
                  disabled={buttonsDisabled}
                  title="Fold (F)"
                  data-testid="button-fold"
                  className={`
                    relative overflow-hidden rounded-xl min-w-[100px] min-h-[3.25rem]
                    font-bold uppercase tracking-wider transition-all
                    ${buttonsDisabled ? "opacity-50 pointer-events-none" : ""}
                    ${kbFlash === "fold" ? "ring-2 ring-white/60 brightness-125" : ""}
                  `}
                  style={{
                    padding: "0.7rem 1.25rem",
                    color: foldConfirm ? "#fff" : "#fca5a5",
                    background: foldConfirm
                      ? "linear-gradient(180deg, #ef4444 0%, #dc2626 40%, #b91c1c 100%)"
                      : "linear-gradient(180deg, rgba(127,29,29,0.4) 0%, rgba(99,20,20,0.5) 50%, rgba(69,10,10,0.6) 100%)",
                    border: foldConfirm ? "2px solid rgba(248,113,113,0.7)" : "1px solid rgba(239,68,68,0.3)",
                    boxShadow: foldConfirm
                      ? "0 0 32px rgba(239,68,68,0.5), 0 6px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)"
                      : "0 6px 20px rgba(0,0,0,0.5), 0 0 10px rgba(239,68,68,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}
                >
                  {foldConfirm && (
                    <motion.div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 60%)" }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent h-1/2" />
                  <span className="relative flex items-center justify-center gap-2">
                    <span className="text-[0.8rem] font-black tracking-[0.15em]">{foldConfirm ? "CONFIRM" : "FOLD"}</span>
                    <kbd className="text-[0.5rem] font-mono opacity-40 bg-black/20 px-1.5 py-0.5 rounded-md border border-white/10">F</kbd>
                  </span>
                </motion.button>

                {/* CHECK / CALL */}
                <motion.button
                  whileHover={buttonsDisabled ? {} : { scale: 1.05, y: -2 }}
                  whileTap={buttonsDisabled ? {} : { scale: 0.93 }}
                  onClick={needsToCall ? handleCall : handleCheck}
                  disabled={buttonsDisabled}
                  title={needsToCall ? `Call $${callAmount} (C)` : "Check (C)"}
                  data-testid="button-call"
                  className={`
                    relative overflow-hidden rounded-xl min-w-[100px] min-h-[3.25rem]
                    font-bold uppercase tracking-wider transition-all
                    ${buttonsDisabled ? "opacity-50 pointer-events-none" : ""}
                    ${kbFlash === "call" ? "ring-2 ring-white/60 brightness-125" : ""}
                  `}
                  style={{
                    padding: "0.7rem 1.25rem",
                    color: "#fff",
                    background: "linear-gradient(180deg, #d4af37 0%, #b8941f 30%, #9a7b18 60%, #7a6210 100%)",
                    border: "1px solid rgba(212,175,55,0.5)",
                    boxShadow: "0 6px 20px rgba(0,0,0,0.5), 0 0 16px rgba(212,175,55,0.25), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.2)",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/[0.1] to-transparent h-1/2" />
                  <span className="relative flex flex-col items-center justify-center gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-[0.8rem] font-black tracking-[0.15em]">{needsToCall ? "CALL" : "CHECK"}</span>
                      <kbd className="text-[0.5rem] font-mono opacity-40 bg-black/20 px-1.5 py-0.5 rounded-md border border-white/10">C</kbd>
                    </span>
                    {needsToCall && (
                      <span
                        className="font-mono text-sm font-black mt-0.5"
                        style={{ color: "#fef3c7", textShadow: "0 0 8px rgba(212,175,55,0.4)" }}
                      >
                        ${callAmount.toLocaleString()}
                      </span>
                    )}
                  </span>
                </motion.button>

                {/* RAISE / ALL-IN */}
                <motion.button
                  whileHover={buttonsDisabled ? {} : { scale: 1.05, y: -2 }}
                  whileTap={buttonsDisabled ? {} : { scale: 0.93 }}
                  onClick={() => {
                    if (buttonsDisabled) return;
                    if (isAllIn) handleAllIn();
                    else handleRaise();
                  }}
                  disabled={buttonsDisabled}
                  title={`Raise to $${betAmount.toLocaleString()} (R)`}
                  data-testid="button-raise"
                  className={`
                    relative overflow-hidden rounded-xl min-w-[100px] min-h-[3.25rem]
                    font-bold uppercase tracking-wider transition-all
                    ${buttonsDisabled ? "opacity-50 pointer-events-none" : ""}
                    ${kbFlash === "raise" ? "ring-2 ring-white/60 brightness-125" : ""}
                  `}
                  style={{
                    padding: "0.7rem 1.25rem",
                    color: "#fff",
                    background: isAllIn
                      ? "linear-gradient(180deg, #f59e0b 0%, #d97706 30%, #b45309 60%, #92400e 100%)"
                      : "linear-gradient(180deg, #c9a227 0%, #a8871c 30%, #8b6f14 60%, #6e580f 100%)",
                    border: isAllIn
                      ? "2px solid rgba(251,191,36,0.5)"
                      : "1px solid rgba(201,162,39,0.4)",
                    boxShadow: isAllIn
                      ? "0 0 36px rgba(245,158,11,0.4), 0 6px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.15)"
                      : "0 6px 20px rgba(0,0,0,0.5), 0 0 14px rgba(201,162,39,0.2), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.15)",
                  }}
                >
                  {isAllIn && (
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)",
                      }}
                      animate={{ x: ["-100%", "100%"] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-white/[0.1] to-transparent h-1/2" />
                  <span className="relative flex flex-col items-center justify-center gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-[0.8rem] font-black tracking-[0.15em]">
                        {isAllIn ? "ALL-IN" : needsToCall ? "RAISE" : "BET"}
                      </span>
                      <kbd className="text-[0.5rem] font-mono opacity-40 bg-black/20 px-1.5 py-0.5 rounded-md border border-white/10">R</kbd>
                    </span>
                    {showRaiseSlider && (
                      <span
                        className="font-mono text-sm font-black mt-0.5"
                        style={{
                          color: isAllIn ? "#fde68a" : "#fef3c7",
                          textShadow: isAllIn ? "0 0 10px rgba(245,158,11,0.5)" : "0 0 6px rgba(234,179,8,0.3)",
                        }}
                      >
                        ${betAmount.toLocaleString()}
                      </span>
                    )}
                  </span>
                </motion.button>

                {/* Buy Time */}
                {onBuyTime && isHeroTurn && heroTimeLeft !== undefined && heroTimeLeft < 30 && (
                  <motion.button
                    whileHover={{ scale: 1.08, y: -2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onBuyTime}
                    data-testid="button-buytime"
                    className={`relative overflow-hidden rounded-xl min-h-[3.25rem] font-bold text-sm uppercase tracking-wider text-white ${timerUrgent ? "animate-pulse" : ""}`}
                    style={{
                      padding: "0.7rem 1rem",
                      background: "linear-gradient(180deg, #b45309 0%, #92400e 50%, #78350f 100%)",
                      border: "1px solid rgba(245,158,11,0.3)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.4), 0 0 12px rgba(245,158,11,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent h-1/2" />
                    <span className="relative">+10s</span>
                    {bigBlind && <span className="font-mono text-[0.5625rem] opacity-40 ml-1 relative">(${bigBlind})</span>}
                  </motion.button>
                )}
              </div>

              {/* Auto toggles */}
              {!isHeroTurn && heroStatus !== "folded" && heroStatus !== "all-in" && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={autoFold}
                        onChange={(e) => { setAutoFold(e.target.checked); if (e.target.checked) setAutoCheckFold(false); }}
                        className="sr-only"
                        data-testid="toggle-autofold"
                      />
                      <div className={`w-4 h-4 rounded-md border transition-all ${autoFold ? "bg-red-500/80 border-red-400/60" : "bg-white/5 border-white/15 group-hover:border-white/30"}`}>
                        {autoFold && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    </div>
                    <span className="text-[0.625rem] font-bold uppercase tracking-wider text-gray-500 group-hover:text-gray-300 transition-colors">
                      Auto-Fold
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={autoCheckFold}
                        onChange={(e) => { setAutoCheckFold(e.target.checked); if (e.target.checked) setAutoFold(false); }}
                        className="sr-only"
                        data-testid="toggle-checkfold"
                      />
                      <div className={`w-4 h-4 rounded-md border transition-all ${autoCheckFold ? "bg-emerald-500/80 border-emerald-400/60" : "bg-white/5 border-white/15 group-hover:border-white/30"}`}>
                        {autoCheckFold && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    </div>
                    <span className="text-[0.625rem] font-bold uppercase tracking-wider text-gray-500 group-hover:text-gray-300 transition-colors">
                      Check/Fold
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
