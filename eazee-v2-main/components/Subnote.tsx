import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';

interface SubnoteProps {
  content: string;
}

const Subnote: React.FC<SubnoteProps> = ({ content }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => setIsOpen(!isOpen)} style={styles.iconContainer}>
        <MIcon name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#000" />
      </TouchableOpacity>
      {isOpen && (
        <View style={styles.contentContainer}>
          <Text>{content}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 5,
    borderLeftWidth: 2,
    borderLeftColor: '#22AB93',
  },
  iconContainer: {
    padding: 5,
  },
  contentContainer: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 5,
  },
});

export default Subnote;