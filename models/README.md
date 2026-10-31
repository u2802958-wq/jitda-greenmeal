# Model versions

- `model_1.joblib` is the existing menu-and-meal random forest, saved when the server starts.
- `model_2.json` is the uploaded model specification and evaluation report. It does not contain fitted tree weights or a fitted TF-IDF vectorizer.
- `model_2.joblib` is trained locally from `data/waste.csv` and `data/menu_cache.json` using the preprocessing and best parameters in `model_2.json`.
- `active_model.json` selects the model for each prediction request. Set `active_model` to `model_1` to roll back, or `model_2` to use the new specification. The setting is checked on each request, so changing it does not require a server restart.
