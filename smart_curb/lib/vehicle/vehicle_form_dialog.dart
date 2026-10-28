// The "Add New Vehicle" dialog.
part of '../main.dart';

class _VehicleFormDialog extends StatefulWidget {
  const _VehicleFormDialog();

  @override
  State<_VehicleFormDialog> createState() => _VehicleFormDialogState();
}

class _VehicleFormDialogState extends State<_VehicleFormDialog> {
  final _manufacturerCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _plateCtrl = TextEditingController();
  final _yearCtrl = TextEditingController();
  final _colorCtrl = TextEditingController();

  @override
  void dispose() {
    _manufacturerCtrl.dispose();
    _modelCtrl.dispose();
    _plateCtrl.dispose();
    _yearCtrl.dispose();
    _colorCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    final model = _modelCtrl.text.trim();
    final plate = _plateCtrl.text.trim();
    if (model.isEmpty || plate.isEmpty) {
      showErrorSnackBar(
          context, 'Please fill out at least Model and License Plate.');
      return;
    }

    Navigator.of(context).pop();

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null) {
      FirebaseDatabase.instance.ref('drivers/$uid/vehicles').push().set({
        'manufacturer': _manufacturerCtrl.text.trim(),
        'model': model,
        'plate': plate,
        'year': _yearCtrl.text.trim(),
        'color': _colorCtrl.text.trim(),
        'createdAt': ServerValue.timestamp,
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Add New Vehicle', style: mono(fontSize: 17)),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 16),
            AppTextField(
              controller: _manufacturerCtrl,
              hintText: 'Manufacturer (e.g. Toyota)',
              icon: Icons.business,
            ),
            const SizedBox(height: 12),
            AppTextField(
              controller: _modelCtrl,
              hintText: 'Model (e.g. RAV 4)',
              icon: Icons.directions_car,
            ),
            const SizedBox(height: 12),
            AppTextField(
              controller: _plateCtrl,
              hintText: 'License Plate (e.g. S108123)',
              icon: Icons.pin,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: AppTextField(
                    controller: _yearCtrl,
                    hintText: 'Year (e.g. 2024)',
                    icon: Icons.calendar_today,
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AppTextField(
                    controller: _colorCtrl,
                    hintText: 'Color (e.g. Silver)',
                    icon: Icons.color_lens,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            _DialogButtons(onConfirm: _submit),
          ],
        ),
      ),
    );
  }
}
