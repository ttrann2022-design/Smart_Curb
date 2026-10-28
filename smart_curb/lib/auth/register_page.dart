// The create-account screen.
part of '../main.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleRegister() async {
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (email.isEmpty || password.isEmpty || _confirmCtrl.text.isEmpty) {
      showErrorSnackBar(context, 'Please fill out all fields.');
      return;
    }
    if (password != _confirmCtrl.text) {
      showErrorSnackBar(context, 'Passwords do not match.');
      return;
    }
    setState(() => _isLoading = true);
    try {
      await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
      if (mounted) Navigator.pop(context);
    } on FirebaseAuthException catch (e) {
      if (mounted) {
        showErrorSnackBar(context, e.message ?? 'Registration failed.');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32.0),
            child: Column(
              children: [
                const FadeSlideIn(
                  child: Icon(Icons.person_add_alt_1, size: 70, color: kAccent),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 1,
                  child: Text('Join Smart Curb', style: mono(fontSize: 24)),
                ),
                const SizedBox(height: 32),
                FadeSlideIn(
                  index: 2,
                  child: AppTextField(
                    controller: _emailCtrl,
                    hintText: 'Email Address',
                    icon: Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress,
                  ),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 3,
                  child: AppTextField(
                    controller: _passwordCtrl,
                    hintText: 'Password',
                    icon: Icons.lock_outline,
                    obscureText: true,
                  ),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 4,
                  child: AppTextField(
                    controller: _confirmCtrl,
                    hintText: 'Confirm Password',
                    icon: Icons.lock_reset,
                    obscureText: true,
                  ),
                ),
                const SizedBox(height: 28),
                FadeSlideIn(
                  index: 5,
                  child: PrimaryButton(
                    title: 'Register',
                    isLoading: _isLoading,
                    onPressed: _handleRegister,
                  ),
                ),
                const SizedBox(height: 16),
                FadeSlideIn(
                  index: 6,
                  child: TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Already have an account? Back to Login'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
