/**
 * Illustrations d'onboarding — pendant mobile de
 * desktop/src/components/onboarding/Illustrations.tsx.
 *
 * Le sens du transit est inversé par rapport au desktop : ici c'est le téléphone
 * qui émet, donc téléphone → serveur → ordinateur. Montrer une liaison directe
 * mentirait sur l'architecture : tout passe par le serveur.
 *
 * Animations en `Animated` du cœur RN plutôt que reanimated : ce sont quatre
 * boucles triviales, une dépendance native de plus ne se justifie pas.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { Palette } from "../theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Boucle 0→1 sans fin.
 *
 * `useNativeDriver: false` est imposé : on anime des attributs SVG (`cx`,
 * `opacity` de forme), que le driver natif ne sait pas porter — il ne gère que
 * les transforms et opacités de style. Quatre boucles sur le thread JS ne se
 * voient pas ; les basculer coûterait une dépendance native de plus.
 */
function useLoop(duration: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return v;
}

/** Point qui parcourt un segment, en s'estompant aux extrémités. */
function TravelDot({ from, to, delay, color }: { from: number; to: number; delay: number; color: string }) {
  const v = useLoop(2400, delay);
  return (
    <AnimatedCircle
      cx={v.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) as any}
      cy={54}
      r={4}
      fill={color}
      opacity={v.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }) as any}
    />
  );
}

/** LED d'activité : pulse d'opacité, décalée pour donner une cascade. */
function Led({ cx, cy, delay, color }: { cx: number; cy: number; delay: number; color: string }) {
  const v = useLoop(1800, delay);
  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={2}
      fill={color}
      opacity={v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 1, 0.2] }) as any}
    />
  );
}

/** Téléphone → serveur → ordinateur. Deux liaisons, jamais une seule. */
export function IlluSync({ p }: { p: Palette }) {
  const A = p.accent;
  const B = p.border;
  return (
    <Svg width={220} height={110} viewBox="0 0 220 120">
      {/* Téléphone (émetteur) */}
      <Rect x={14} y={26} width={32} height={56} rx={6} stroke={B} strokeWidth={2} fill="none" />
      <Path d="M24 76h12" stroke={B} strokeWidth={2} strokeLinecap="round" />

      {/* Serveur — tout transite par lui */}
      <Rect x={103} y={39} width={32} height={13} rx={3} stroke={B} strokeWidth={2} fill={p.surface} />
      <Rect x={103} y={56} width={32} height={13} rx={3} stroke={B} strokeWidth={2} fill={p.surface} />
      <Led cx={110} cy={45.5} delay={0} color={A} />
      <Led cx={110} cy={62.5} delay={300} color={A} />

      {/* Ordinateur (destinataire) */}
      <Rect x={166} y={34} width={48} height={34} rx={5} stroke={B} strokeWidth={2} fill="none" />
      <Path d="M178 76h24" stroke={B} strokeWidth={2} strokeLinecap="round" />

      {/* Liaisons + points en relais */}
      <Path d="M52 54h45" stroke={A} strokeWidth={2} strokeLinecap="round" strokeDasharray="4 6" />
      <TravelDot from={52} to={97} delay={0} color={A} />
      <Path d="M141 54h19" stroke={A} strokeWidth={2} strokeLinecap="round" strokeDasharray="4 6" />
      <TravelDot from={141} to={160} delay={1200} color={A} />
    </Svg>
  );
}

/** Rack à trois unités, LEDs en cascade. */
export function IlluServer({ p }: { p: Palette }) {
  const A = p.accent;
  const B = p.border;
  return (
    <Svg width={160} height={110} viewBox="0 0 160 120">
      <Rect x={53} y={37} width={54} height={16} rx={4} stroke={B} strokeWidth={2} fill={p.surface} />
      <Rect x={53} y={59} width={54} height={16} rx={4} stroke={B} strokeWidth={2} fill={p.surface} />
      <Rect x={53} y={81} width={54} height={16} rx={4} stroke={B} strokeWidth={2} fill={p.surface} />
      <Path d="M74 45h24M74 67h24M74 89h24" stroke={B} strokeWidth={1.5} strokeLinecap="round" opacity={0.45} />
      <Led cx={63} cy={45} delay={0} color={A} />
      <Led cx={63} cy={67} delay={300} color={A} />
      <Led cx={63} cy={89} delay={600} color={A} />
    </Svg>
  );
}

/** Écran + coche qui pulse doucement. */
export function IlluDevice({ p }: { p: Palette }) {
  const A = p.accent;
  const B = p.border;
  const v = useLoop(2200);
  return (
    <Svg width={160} height={110} viewBox="0 0 160 120">
      <Rect x={40} y={34} width={80} height={52} rx={7} stroke={B} strokeWidth={2} fill="none" />
      <Path d="M62 94h36" stroke={B} strokeWidth={2} strokeLinecap="round" />
      <AnimatedPath
        d="M68 59l8 8 16-17"
        stroke={A}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 1, 0.35] }) as any}
      />
    </Svg>
  );
}

/** Bouclier + serrure, anneau qui respire. */
export function IlluLock({ p }: { p: Palette }) {
  const A = p.accent;
  const B = p.border;
  const v = useLoop(2600);
  return (
    <Svg width={160} height={110} viewBox="0 0 160 120">
      <AnimatedCircle
        cx={80}
        cy={62}
        r={34}
        stroke={A}
        strokeWidth={1.5}
        fill="none"
        opacity={v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.08, 0.35, 0.08] }) as any}
      />
      <Path
        d="M80 32l24 9v15c0 16-11 26-24 31-13-5-24-15-24-31V41z"
        stroke={B}
        strokeWidth={2}
        strokeLinejoin="round"
        fill={p.surface}
      />
      <Path d="M80 57v9" stroke={A} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={80} cy={72} r={2.5} fill={A} />
    </Svg>
  );
}
