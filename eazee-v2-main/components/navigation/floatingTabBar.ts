import { Platform } from 'react-native';

export function getFloatingTabBarInset(bottomInset: number) {
  const tabBarBottomOffset = Platform.OS === 'android' ? 10 : 8;
  const tabBarHeight = 56;

  return tabBarHeight + tabBarBottomOffset + 8;
}
