/**
 * Bjet Mobile - useMerchantRuleMutations Hook (Phase 10 / Bjet Lite)
 * Typed mutation hooks for Merchant Rules creation, replacement, and deletion.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { merchantRuleRepository, transactionRepository } from '../repositories';
import {
  UserMerchantRule,
  CreateMerchantRuleRequest,
  ReplaceMerchantRuleParams,
} from '../types/rules';

/**
 * Mutation hook to create a new merchant rule.
 * Invalidates ['rules'] cache.
 */
export function useCreateMerchantRule() {
  const queryClient = useQueryClient();

  return useMutation<UserMerchantRule, Error, CreateMerchantRuleRequest>({
    mutationFn: (data: CreateMerchantRuleRequest) => merchantRuleRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });
}

/**
 * Mutation hook for explicit delete-and-recreate replacement of an existing merchant rule.
 * Handles failure with restoration attempts.
 * Invalidates ['rules'] cache on completion.
 */
export function useReplaceMerchantRule() {
  const queryClient = useQueryClient();

  return useMutation<UserMerchantRule, Error, ReplaceMerchantRuleParams>({
    mutationFn: ({ originalRule, replacement }: ReplaceMerchantRuleParams) =>
      merchantRuleRepository.replaceRule(originalRule.id, replacement),
    onSettled: () => {
      // Invalidate and refetch rules whether succeeded or failed to ensure cache reflects database truth
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      queryClient.refetchQueries({ queryKey: ['rules'] });
    },
  });
}

/**
 * Mutation hook to delete a merchant rule.
 * Invalidates ['rules'] cache.
 */
export function useDeleteMerchantRule() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => merchantRuleRepository.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });
}

/**
 * Mutation hook to categorize existing uncategorized transactions for a merchant
 * and persist/update the user merchant rule for future transactions.
 */
export function useCategorizeMerchantTransactions() {
  const queryClient = useQueryClient();

  return useMutation<
    { updatedCount: number; ruleCreatedOrUpdated: boolean },
    Error,
    { merchantPattern: string; categoryId: number; saveRule?: boolean }
  >({
    mutationFn: ({ merchantPattern, categoryId, saveRule = true }) =>
      transactionRepository.categorizeMerchantTransactions(merchantPattern, categoryId, saveRule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

