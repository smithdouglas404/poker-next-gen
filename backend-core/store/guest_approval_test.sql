\set ON_ERROR_STOP on
\pset pager off
DELETE FROM poker_guest_approval WHERE match_id LIKE 'test_%';

-- 1. Request is idempotent: a reconnect must not queue a duplicate.
INSERT INTO poker_guest_approval (id,club_id,match_id,user_id,status)
  VALUES ('ga1','c1','test_m1','u1','pending') ON CONFLICT (match_id,user_id) DO NOTHING;
INSERT INTO poker_guest_approval (id,club_id,match_id,user_id,status)
  VALUES ('ga2','c1','test_m1','u1','pending') ON CONFLICT (match_id,user_id) DO NOTHING;
SELECT 'idempotent_request' AS test,
       CASE WHEN COUNT(*)=1 THEN 'PASS' ELSE 'FAIL ('||COUNT(*)||' rows)' END AS result
  FROM poker_guest_approval WHERE match_id='test_m1';

-- 2. Decide is atomic: the second decision must affect ZERO rows.
UPDATE poker_guest_approval SET status='approved',decided_by='opA',decided_at=NOW()
 WHERE match_id='test_m1' AND user_id='u1' AND status='pending';
CREATE TEMP TABLE r2 AS
  WITH u AS (
    UPDATE poker_guest_approval SET status='denied',decided_by='opB',decided_at=NOW()
     WHERE match_id='test_m1' AND user_id='u1' AND status='pending' RETURNING 1)
  SELECT COUNT(*) AS n FROM u;
SELECT 'atomic_decide' AS test,
       CASE WHEN (SELECT n FROM r2)=0 THEN 'PASS' ELSE 'FAIL (second write landed)' END AS result;
SELECT 'winner_kept' AS test,
       CASE WHEN status='approved' AND decided_by='opA' THEN 'PASS'
            ELSE 'FAIL (now '||status||' by '||decided_by||')' END AS result
  FROM poker_guest_approval WHERE match_id='test_m1' AND user_id='u1';

-- 3. A decided row is never reset to pending by a reconnect.
INSERT INTO poker_guest_approval (id,club_id,match_id,user_id,status)
  VALUES ('ga3','c1','test_m1','u1','pending') ON CONFLICT (match_id,user_id) DO NOTHING;
SELECT 'decision_survives_reconnect' AS test,
       CASE WHEN status='approved' THEN 'PASS' ELSE 'FAIL ('||status||')' END AS result
  FROM poker_guest_approval WHERE match_id='test_m1' AND user_id='u1';

-- 4. Shared-device signal the approver reads.
INSERT INTO poker_guest_approval (id,club_id,match_id,user_id,device_fp,status) VALUES
  ('gd1','cdev','test_m2','ua','same-dev','pending'),
  ('gd2','cdev','test_m3','ub','same-dev','pending'),
  ('gd3','cdev','test_m4','uc','other-dev','pending') ON CONFLICT DO NOTHING;
SELECT 'shared_device_signal' AS test,
       CASE WHEN (SELECT COUNT(DISTINCT b.user_id) FROM poker_guest_approval b
                   WHERE b.club_id='cdev' AND b.device_fp='same-dev' AND b.user_id<>'ua')=1
            AND  (SELECT COUNT(DISTINCT b.user_id) FROM poker_guest_approval b
                   WHERE b.club_id='cdev' AND b.device_fp='other-dev' AND b.user_id<>'uc')=0
       THEN 'PASS' ELSE 'FAIL' END AS result;

-- 5. Fail-closed: absence of a row must not read as approved.
SELECT 'no_row_not_approved' AS test,
       CASE WHEN NOT EXISTS (SELECT 1 FROM poker_guest_approval
                              WHERE match_id='test_absent' AND user_id='ghost' AND status='approved')
       THEN 'PASS' ELSE 'FAIL' END AS result;

DELETE FROM poker_guest_approval WHERE match_id LIKE 'test_%';
