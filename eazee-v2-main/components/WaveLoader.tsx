
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

const WaveLoader = () => {
  // Constants
  const SIZE = 2;
  const MAX_HEIGHT = SIZE * 10;
  const ANIMATION_DURATION = 1500;
  const NUM_BARS = 5;
  const DELAY_OFFSET = 200;

  // Create animated values for each bar
  const animatedValues = useRef(
    Array(NUM_BARS).fill(0).map(() => new Animated.Value(SIZE))
  ).current;

  useEffect(() => {
    // Create animation sequence for each bar
    const animations = animatedValues.map((value, index) => {
      return Animated.sequence([
        // Wait for delay based on bar position
        Animated.delay(index * DELAY_OFFSET),
        // Loop the wave animation
        Animated.loop(
          Animated.sequence([
            // Grow to max height
            Animated.timing(value, {
              toValue: MAX_HEIGHT,
              duration: ANIMATION_DURATION * 0.25,
              useNativeDriver: false,
            }),
            // Shrink back to original size
            Animated.timing(value, {
              toValue: SIZE,
              duration: ANIMATION_DURATION * 0.25,
              useNativeDriver: false,
            }),
            // Stay at original size for remaining duration
            Animated.timing(value, {
              toValue: SIZE,
              duration: ANIMATION_DURATION * 0.5,
              useNativeDriver: false,
            }),
          ])
        ),
      ]);
    });

    // Start all animations
    Animated.parallel(animations).start();

    // Cleanup
    return () => {
      animations.forEach(anim => anim.stop());
    };
  }, []);

  return (
    <View style={styles.container}>
      {animatedValues.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              height: value,
              backgroundColor: value.interpolate({
                inputRange: [SIZE, MAX_HEIGHT],
                outputRange: ['#12F61A', '#FFFFFF'],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    height: 100,
  },
  bar: {
    width: 5,
    borderRadius: 20,
  },
});

export default WaveLoader;