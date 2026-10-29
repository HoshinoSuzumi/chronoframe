ALTER TABLE platform_payment_settings ADD COLUMN purchase_method TEXT NOT NULL DEFAULT 'payment' CHECK(purchase_method IN('payment','activation_code'));
