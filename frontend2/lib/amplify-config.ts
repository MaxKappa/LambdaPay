import { Amplify } from "aws-amplify"

// Amplify configuration
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_AMPLIFY_USERPOOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_AMPLIFY_WEBCLIENT_ID!,
      identityPoolId: process.env.NEXT_PUBLIC_AMPLIFY_IDENTITYPOOL_ID!,
    },
  },
}

export function configureAmplify() {
  try {
    Amplify.configure(amplifyConfig)
  } catch (error) {
    console.error("Error configuring Amplify:", error)
  }
}
