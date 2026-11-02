-- Veelox Migration 0013: Content Kit Credit Cost & Atomic Transaction Engine
-- Enforces 1 Content Kit = 5 credits server-side with atomic balance checking, concurrency protection, and automatic refund.

-- 1. Extend credit_transactions with action, credits_used, status, and content_kit_id
ALTER TABLE public.credit_transactions
ADD COLUMN IF NOT EXISTS action text,
ADD COLUMN IF NOT EXISTS credits_used integer,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS content_kit_id text;

CREATE INDEX IF NOT EXISTS credit_tx_action_idx ON public.credit_transactions (action);
CREATE INDEX IF NOT EXISTS credit_tx_status_idx ON public.credit_transactions (status);
CREATE INDEX IF NOT EXISTS credit_tx_kit_id_idx ON public.credit_transactions (content_kit_id);

-- 2. Atomic Credit Deduction Function
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id uuid,
  p_amount int,
  p_action text,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_credits int;
  v_current_credits int;
  v_tx_id uuid;
BEGIN
  -- Ensure user has a subscription row (defaults to free 30 credits)
  INSERT INTO public.subscriptions (user_id, plan, status, credits)
  VALUES (p_user_id, 'free', 'active', 30)
  ON CONFLICT (user_id) DO NOTHING;

  -- Atomically deduct credits if balance is sufficient
  UPDATE public.subscriptions
  SET credits = credits - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id AND credits >= p_amount
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NULL THEN
    -- Insufficient credits, fetch current balance
    SELECT credits INTO v_current_credits FROM public.subscriptions WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'credits_remaining', COALESCE(v_current_credits, 0)
    );
  END IF;

  -- Record pending/reserved transaction in credit_transactions
  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    type,
    feature,
    reference_id,
    action,
    credits_used,
    status
  ) VALUES (
    p_user_id,
    -p_amount,
    'usage',
    p_action,
    p_reference_id,
    p_action,
    p_amount,
    'pending'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'credits_remaining', v_new_credits,
    'transaction_id', v_tx_id
  );
END;
$$;

-- 3. Atomic Credit Refund Function (invoked if generation fails or times out)
CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id uuid,
  p_amount int,
  p_action text,
  p_transaction_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_credits int;
  v_refund_tx_id uuid;
BEGIN
  -- Add credits back
  UPDATE public.subscriptions
  SET credits = credits + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING credits INTO v_new_credits;

  -- Update original transaction status if provided
  IF p_transaction_id IS NOT NULL THEN
    UPDATE public.credit_transactions
    SET status = 'failed'
    WHERE id = p_transaction_id;
  END IF;

  -- Record refund transaction in credit_transactions
  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    type,
    feature,
    reference_id,
    action,
    credits_used,
    status
  ) VALUES (
    p_user_id,
    p_amount,
    'refund',
    p_action,
    COALESCE(p_transaction_id::text, p_reason),
    p_action,
    -p_amount,
    'refunded'
  ) RETURNING id INTO v_refund_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'credits_remaining', v_new_credits,
    'refund_transaction_id', v_refund_tx_id
  );
END;
$$;

-- 4. Complete Credit Transaction (marks pending usage transaction as completed)
CREATE OR REPLACE FUNCTION public.complete_credit_transaction(
  p_transaction_id uuid,
  p_reference_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.credit_transactions
  SET status = 'completed',
      reference_id = COALESCE(p_reference_id, reference_id),
      content_kit_id = COALESCE(p_reference_id, content_kit_id)
  WHERE id = p_transaction_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, int, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, int, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_credit_transaction(uuid, text) TO authenticated, service_role;
