import { Stack } from 'expo-router';
import { DraftProvider } from './DraftContext';

const StackLayout = () => {
    return (
        <DraftProvider>
            <Stack>
                <Stack.Screen
                    name="index"
                    options={{
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="draft"
                    options={{
                        headerShown: false,
                        title: "Draft Reply",
                    }}
                />
                <Stack.Screen
                    name="batchDraft"
                    options={{
                        headerShown: false,
                        title: "Draft Reply",
                    }}
                />
            </Stack>
        </DraftProvider>
    );
};

export default StackLayout;
