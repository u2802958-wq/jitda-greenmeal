# Model versions

- `model_1.joblib` is the existing prediction model and remains available for rollback.
- `model_2.json` is a model specification and evaluation report; it does not contain fitted model weights.
- `model_3.onnx` is the earlier ONNX export retained as an archive.
- `model_4.joblib` is the active fitted regression pipeline. It accepts one row with `끼니` and `메뉴`; `메뉴` is the selected menu names joined by spaces. Its fitted preprocessing and target inverse-transform are included.
- `model_4.onnx` is retained as uploaded. The application uses `model_4.joblib`; the ONNX copy was not selected because its sample outputs differed from joblib and its embedded locale is unavailable in this environment.
- To roll back, change `active_model` in `active_model.json` from `model_4` to `model_1`. The selection is checked for each prediction request.
