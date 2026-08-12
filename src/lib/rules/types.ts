export type MatchType = 'ALL' | 'ANY';

export type ConditionField =
  | 'from'
  | 'to'
  | 'cc'
  | 'subject'
  | 'body'
  | 'hasAttachment'
  | 'hasLabelId';

export type ConditionOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'matches_regex';

export interface RuleCriterion {
  field: ConditionField;
  operator: ConditionOperator;
  value: string | boolean;
}

export interface RuleConditions {
  matchType: MatchType;
  criteria: RuleCriterion[];
}

export interface RuleActions {
  addLabelIds?: string[];
  removeLabelIds?: string[];
  markAsRead?: boolean;
  markAsStarred?: boolean;
  markAsHighRisk?: boolean;
  triggerWebhookId?: string;
  forwardTo?: string[];
}

export interface EmailEvaluationInput {
  id?: string;
  accountId?: string;
  fromAddress?: string | null;
  fromName?: string | null;
  toAddresses?: Array<{ address?: string; name?: string }> | string[] | string | null;
  ccAddresses?: Array<{ address?: string; name?: string }> | string[] | string | null;
  subject?: string | null;
  bodyText?: string | null;
  hasAttachments?: boolean | null;
  isRead?: boolean | null;
  isStarred?: boolean | null;
  isHighRisk?: boolean | null;
  labelIds?: string[] | null;
}

export interface EmailRuleDefinition {
  id?: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  priority: number;
  stopProcessing?: boolean;
  accountId?: string | null;
  conditions: RuleConditions;
  actions: RuleActions;
}
