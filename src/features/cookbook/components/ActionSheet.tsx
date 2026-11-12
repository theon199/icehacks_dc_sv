import { View } from 'react-native';

import { Button, ListRow, type IconName } from '@/ui';

import { BottomSheet } from './BottomSheet';

export interface SheetAction {
  key: string;
  label: string;
  icon: IconName;
  destructive?: boolean;
  onPress: () => void;
}

export interface ActionSheetProps {
  visible: boolean;
  title: string;
  description?: string;
  actions: readonly SheetAction[];
  onClose: () => void;
  testID?: string;
}

/** A short list of actions for one item. Choosing an action closes the sheet first. */
export function ActionSheet({
  visible,
  title,
  description,
  actions,
  onClose,
  testID,
}: ActionSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      {...(description ? { description } : {})}
      {...(testID ? { testID } : {})}
      footer={<Button label="Cancel" variant="ghost" onPress={onClose} haptic={false} fullWidth />}
    >
      <View>
        {actions.map((action, index) => (
          <ListRow
            key={action.key}
            title={action.label}
            icon={action.icon}
            destructive={action.destructive ?? false}
            divider={index < actions.length - 1}
            onPress={() => {
              onClose();
              action.onPress();
            }}
            testID={`action-${action.key}`}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
