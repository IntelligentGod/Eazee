import { Redirect, useGlobalSearchParams } from 'expo-router'

const HomePage = () => {
    const { code, error } = useGlobalSearchParams<{ code?: string; error?: string }>();

    if (typeof code === 'string' || typeof error === 'string') {
        return <Redirect href="/home/account" />
    }

    return (
       <Redirect href="/chat" />
    )
}

export default HomePage
