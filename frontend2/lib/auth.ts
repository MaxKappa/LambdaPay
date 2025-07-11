import {
  signIn as amplifySignIn,
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  signOut as amplifySignOut,
  getCurrentUser as amplifyGetCurrentUser,
  fetchAuthSession,
} from "aws-amplify/auth"
import { configureAmplify } from "./amplify-config"

// Make sure Amplify is configured
configureAmplify()

export async function signIn(email: string, password: string) {
  try {
    const result = await amplifySignIn({
      username: email,
      password: password,
    })
    return result
  } catch (error: any) {
    throw new Error(error.message || "Sign in failed")
  }
}

export async function signUp(email: string, password: string, username?: string) {
  try {
    const result = await amplifySignUp({
      username: email,
      password: password,
      options: {
        userAttributes: {
          email: email,
          ...(username && { preferred_username: username }),
        },
      },
    })
    return result
  } catch (error: any) {
    throw new Error(error.message || "Sign up failed")
  }
}

export async function confirmSignUp(email: string, confirmationCode: string) {
  try {
    const result = await amplifyConfirmSignUp({
      username: email,
      confirmationCode: confirmationCode,
    })
    return result
  } catch (error: any) {
    throw new Error(error.message || "Confirmation failed")
  }
}

export async function signOut() {
  try {
    await amplifySignOut()
  } catch (error: any) {
    throw new Error(error.message || "Sign out failed")
  }
}

export async function getCurrentUser() {
  try {
    const user = await amplifyGetCurrentUser()
    return user
  } catch (error) {
    return null
  }
}

export async function getUsernameFromToken() {
  try {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken
    if (token) {
      const payload = JSON.parse(atob(token.toString().split('.')[1]))
      return payload.preferred_username || payload.email?.split('@')[0]
    }
    return null
  } catch (error) {
    console.error('Error extracting username from token:', error)
    return null
  }
}
