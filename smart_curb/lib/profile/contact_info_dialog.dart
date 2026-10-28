// The contact information form dialog.
part of '../main.dart';

class _ContactInfoDialog extends StatefulWidget {
  final Map<String, dynamic>? existingData;
  const _ContactInfoDialog({this.existingData});

  @override
  State<_ContactInfoDialog> createState() => _ContactInfoDialogState();
}

class _ContactInfoDialogState extends State<_ContactInfoDialog> {
  static const List<String> _genders = ['Male', 'Female', 'Other'];

  late final TextEditingController _phoneCtrl;
  late final TextEditingController _firstCtrl;
  late final TextEditingController _lastCtrl;
  late final TextEditingController _middleCtrl;
  late final TextEditingController _addr1Ctrl;
  late final TextEditingController _addr2Ctrl;
  late final TextEditingController _cityCtrl;
  late final TextEditingController _stateCtrl;
  late final TextEditingController _zipCtrl;
  late final TextEditingController _countryCtrl;
  String? _gender;

  @override
  void initState() {
    super.initState();
    final d = widget.existingData;
    String v(String k) => d?[k]?.toString() ?? '';
    _phoneCtrl = TextEditingController(text: formatPhone(v('phone')));
    _firstCtrl = TextEditingController(text: v('firstName'));
    _lastCtrl = TextEditingController(text: v('lastName'));
    _middleCtrl = TextEditingController(text: v('middleName'));
    _addr1Ctrl = TextEditingController(text: v('address1'));
    _addr2Ctrl = TextEditingController(text: v('address2'));
    _cityCtrl = TextEditingController(text: v('city'));
    _stateCtrl = TextEditingController(text: v('state'));
    _zipCtrl = TextEditingController(text: v('zipCode'));
    _countryCtrl = TextEditingController(text: v('country'));
    // Guard: an unexpected stored value would crash the dropdown.
    final g = d?['gender']?.toString();
    _gender = _genders.contains(g) ? g : null;
  }

  @override
  void dispose() {
    for (final c in [
      _phoneCtrl,
      _firstCtrl,
      _lastCtrl,
      _middleCtrl,
      _addr1Ctrl,
      _addr2Ctrl,
      _cityCtrl,
      _stateCtrl,
      _zipCtrl,
      _countryCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    final required = [
      _phoneCtrl,
      _firstCtrl,
      _lastCtrl,
      _addr1Ctrl,
      _cityCtrl,
      _stateCtrl,
      _zipCtrl,
      _countryCtrl,
    ];
    if (_gender == null || required.any((c) => c.text.trim().isEmpty)) {
      showErrorSnackBar(context, 'Please fill in all required fields.');
      return;
    }
    if (_phoneCtrl.text.replaceAll(RegExp(r'\D'), '').length != 10) {
      showErrorSnackBar(context, 'Please enter a 10-digit phone number.');
      return;
    }

    Navigator.of(context).pop();

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null) {
      FirebaseDatabase.instance.ref('drivers/$uid/profile').update({
        'firstName': _firstCtrl.text.trim(),
        'lastName': _lastCtrl.text.trim(),
        'middleName': _middleCtrl.text.trim(),
        'phone': formatPhone(_phoneCtrl.text), // saved as xxx-xxx-xxxx
        'gender': _gender,
        'address1': _addr1Ctrl.text.trim(),
        'address2': _addr2Ctrl.text.trim(),
        'city': _cityCtrl.text.trim(),
        'state': _stateCtrl.text.trim(),
        'zipCode': _zipCtrl.text.trim(),
        'country': _countryCtrl.text.trim(),
        'updatedAt': ServerValue.timestamp,
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 500),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    widget.existingData == null
                        ? 'Add Contact Info'
                        : 'Edit Contact Info',
                    style: mono(fontSize: 17),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: AppTextField(
                      controller: _firstCtrl,
                      hintText: 'First Name *',
                      icon: Icons.person_outline,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AppTextField(
                      controller: _lastCtrl,
                      hintText: 'Last Name *',
                      icon: Icons.person_outline,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _middleCtrl,
                hintText: 'Middle Name (Optional)',
                icon: Icons.badge_outlined,
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _phoneCtrl,
                hintText: 'Phone Number * (xxx-xxx-xxxx)',
                icon: Icons.phone_outlined,
                keyboardType: TextInputType.phone,
                inputFormatters: [PhoneInputFormatter()],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: kCard,
                  borderRadius: BorderRadius.circular(kRadius),
                  border: Border.all(color: kDivider),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _gender,
                    isExpanded: true,
                    hint: const Row(
                      children: [
                        Icon(Icons.transgender, color: kTextMuted, size: 20),
                        SizedBox(width: 12),
                        Text(
                          'Gender *',
                          style: TextStyle(color: kTextMuted, fontSize: 14),
                        ),
                      ],
                    ),
                    dropdownColor: kCard,
                    borderRadius: BorderRadius.circular(kRadius),
                    icon: const Icon(Icons.arrow_drop_down, color: kTextMuted),
                    items: [
                      for (final g in _genders)
                        DropdownMenuItem(value: g, child: Text(g)),
                    ],
                    onChanged: (val) => setState(() => _gender = val),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _addr1Ctrl,
                hintText: 'Address Line 1 *',
                icon: Icons.home_outlined,
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _addr2Ctrl,
                hintText: 'Address Line 2 (Optional)',
                icon: Icons.location_city_outlined,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: AppTextField(
                      controller: _cityCtrl,
                      hintText: 'City *',
                      icon: Icons.location_on_outlined,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AppTextField(
                      controller: _stateCtrl,
                      hintText: 'State *',
                      icon: Icons.map_outlined,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: AppTextField(
                      controller: _zipCtrl,
                      hintText: 'Zip Code *',
                      icon: Icons.markunread_mailbox_outlined,
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AppTextField(
                      controller: _countryCtrl,
                      hintText: 'Country *',
                      icon: Icons.public_outlined,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              _DialogButtons(onConfirm: _submit),
            ],
          ),
        ),
      ),
    );
  }
}
