import { StyleSheet } from 'react-native';

const editStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 0,
    backgroundColor: '#FFCD4E',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    flexDirection: 'column',
    paddingTop: 50,
    backgroundColor: '#FFCD4E',
  },
  bottomContainer: {
    marginTop: 'auto',
  },
  dragBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    paddingBottom: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragBarLine: {
    width: 15,
    height: 1.5,
    backgroundColor: '#9F9A9A',
    marginVertical: 1,
    borderRadius: 1,
  },
  dragBarLineActive: {
    width: 15,
    height: 1.5,
    backgroundColor: '#000000',
    marginVertical: 1,
    borderRadius: 1,
  },
  editorContainer: {
    position: 'relative',
    backgroundColor: '#FEFEE8',
    borderRadius: 20,
    marginHorizontal: 15,
    marginBottom: 20,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#CBD0D2',
  },
  appendButton: {
    backgroundColor: '#fff',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  tabButton: {
    marginHorizontal: 10,
  },
  iconContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 6,
  },
  aiOutputContainer: {
    flex: 2,
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  aiOutputText: {
    fontSize: 16,
    color: '#333',
  },
  microphoneButton: {
    backgroundColor: '#22AB93',
    borderRadius: 8,
    width: 80,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 10,
    alignSelf: 'center',
  },
  microphoneButtonActive: {
    backgroundColor: '#22AB93',
  },
  microphoneButtonText: {
    color: '#fff',
  },
  keyboardAvoidingView: {
    position: 'absolute',
    width: '100%',
    bottom: 0,
  },
  saveButton: {
    backgroundColor: '#6D92CB',
    borderRadius: 10,
    padding: 10,
    width: 80,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 10,
    alignSelf: 'center',
  },
  saveButtonText: {
    fontSize: 18,
    color: '#fff',
  },
  textInputWrapper: {
    flex: 1,
    justifyContent: 'center',
    height: 35,
  },
  textInput: {
    color: '#000',
    flex: 1,
    height: 30,
    fontSize: 12,
    borderRadius: 20,
    paddingHorizontal: 10,
    marginRight: 10,
    backgroundColor: '#D9D9D9',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#FED7D7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEB2B2',
    alignItems: 'center',
  },
  errorIcon: {
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#E53E3E',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#E53E3E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

const modalStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    maxHeight: '80%',
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    maxHeight: 200,
    color: '#000',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    backgroundColor: '#22AB93',
    borderRadius: 5,
    padding: 10,
    width: '45%',
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#EB4335',
    borderRadius: 5,
    padding: 10,
    width: '45%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

const imageStyles = StyleSheet.create({
  aiOutputImage: {
    width: '100%',
    height: 200,
    resizeMode: 'contain',
  },
  enlargedImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enlargedImage: {
    width: '90%',
    height: '90%',
    resizeMode: 'contain',
  },
});

export const styles = {
  ...editStyles,
  ...modalStyles,
  ...imageStyles,
};