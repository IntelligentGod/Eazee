import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';

type GlassTabBarBackgroundProps = {
  colors?: [string, string];
};

export function GlassTabBarBackground({
  colors = ['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.08)'],
}: GlassTabBarBackgroundProps) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      />
      <View style={styles.backgroundBorder} />
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  backgroundBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
});
