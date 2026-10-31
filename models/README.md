# Model versions

- `model_1.joblib` is the existing prediction model, saved by the server at startup.
- `model_2.json` is the uploaded configuration and evaluation report. It contains no fitted estimator, tree weights, or fitted TF-IDF vocabulary, so it cannot produce predictions by itself.
- The active application remains on `model_1` until a fitted `model_2.joblib` pipeline is supplied and connected.
- For model 2, provide a fitted scikit-learn `Pipeline` that accepts a pandas DataFrame with `year_trend`, `month_sin`, `month_cos`, `weekday_sin`, `weekday_cos`, `year_cycle_sin`, `year_cycle_cos`, `meal`, and `menu_text` columns, and predicts waste in kilograms. Save the complete fitted preprocessing and estimator together, including the TF-IDF vocabulary/IDF weights and OneHotEncoder categories.
