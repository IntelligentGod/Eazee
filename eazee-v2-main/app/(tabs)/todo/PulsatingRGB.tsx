import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

interface PulsatingLineProps {
  width: number;
  height: number;
}

const PulsatingLine: React.FC<PulsatingLineProps> = ({ width, height }) => {
  const hueAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const hueAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(hueAnim, {
          toValue: 30,
          duration: 1500,
          useNativeDriver: false,
        }),
        Animated.timing(hueAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: false,
        }),
      ])
    );

    const opacityAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    );

    hueAnimation.start();
    opacityAnimation.start();

    return () => {
      hueAnimation.stop();
      opacityAnimation.stop();
    };
  }, []);

  const backgroundColor = hueAnim.interpolate({
    inputRange: [0, 30],
    // outputRange: ['hsl(123, 86%, 52%)', 'hsl(153, 86%, 52%)'],
    outputRange: ['hsl(162, 67%, 40%)', 'hsl(192, 67%, 40%)'],
  });

  return (
    <Animated.View
      style={[
        styles.line,
        {
          width,
          height,
          backgroundColor,
          opacity: opacityAnim,
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  line: {
    alignSelf: 'center',
  },
});

export default PulsatingLine;