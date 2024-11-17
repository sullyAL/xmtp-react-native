import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { TestCategory } from './TestScreen'

export type NavigationParamList = {
  launch: undefined
  test: { testSelection: TestCategory }
  home: undefined
  group: { id: string }
  conversation: { topic: string }
  conversationCreate: undefined
  streamTest: undefined
}

export const Navigator = createNativeStackNavigator<NavigationParamList>()
