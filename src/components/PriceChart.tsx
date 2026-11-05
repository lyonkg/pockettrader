import React, { useMemo, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { Candle } from '../data/types';
import { colors } from '../theme';

interface Props {
  data: Candle[];
  height?: number;
  color?: string;
  onScrub?: (point: Candle | null) => void;
}

const PAD_Y = 12;

/**
 * Lightweight interactive line chart built on react-native-svg.
 * Works identically on iOS, Android and web. Touch / drag (or click-drag on web)
 * to scrub; the parent receives the point under the finger via onScrub.
 */
export default function PriceChart({ data, height = 220, color = colors.green, onScrub }: Props) {
  const [width, setWidth] = useState(0);
  const [idx, setIdx] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (data.length < 2 || width === 0) return null;
    let min = Infinity, max = -Infinity;
    for (const c of data) { if (c.p < min) min = c.p; if (c.p > max) max = c.p; }
    const range = max - min || max * 0.01 || 1;
    const x = (i: number) => (i / (data.length - 1)) * width;
    const y = (p: number) => PAD_Y + (1 - (p - min) / range) * (height - PAD_Y * 2);
    let line = '';
    data.forEach((c, i) => { line += `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(c.p).toFixed(2)}`; });
    const area = `${line}L${width},${height}L0,${height}Z`;
    return { line, area, x, y, min, max };
  }, [data, width, height]);

  const handle = (e: GestureResponderEvent) => {
    if (!geom || width === 0) return;
    const lx = Math.max(0, Math.min(width, e.nativeEvent.locationX));
    const i = Math.round((lx / width) * (data.length - 1));
    setIdx(i);
    onScrub?.(data[i]);
  };
  const end = () => { setIdx(null); onScrub?.(null); };

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    <View
      style={[styles.wrap, { height }]}
      onLayout={onLayout}
      testID="price-chart"
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={handle}
      onResponderMove={handle}
      onResponderRelease={end}
      onResponderTerminate={end}
    >
      {geom ? (
        <Svg width={width} height={height} pointerEvents="none">
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={geom.area} fill="url(#fill)" />
          <Path d={geom.line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
          {idx != null && data[idx] && (
            <>
              <Line x1={geom.x(idx)} x2={geom.x(idx)} y1={0} y2={height} stroke={colors.muted} strokeWidth={1} strokeDasharray="4,4" />
              <Circle cx={geom.x(idx)} cy={geom.y(data[idx].p)} r={5} fill={color} stroke={colors.bg} strokeWidth={2} />
            </>
          )}
        </Svg>
      ) : (
        <Text style={styles.empty}>{data.length < 2 && width > 0 ? 'Loading chart…' : ''}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', justifyContent: 'center', userSelect: 'none' } as any,
  empty: { color: colors.muted, textAlign: 'center' },
});
