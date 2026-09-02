import { MaterialCommunityIcons } from '@expo/vector-icons';

export type SettingItemProps = {
    iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    title: string;
    onPress?: () => void;
  };