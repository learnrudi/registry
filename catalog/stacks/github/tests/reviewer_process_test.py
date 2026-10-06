import importlib.util
from pathlib import Path
import unittest
import time
from types import SimpleNamespace
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('control_activity',Path(__file__).parents[1] / 'deploy/reviewer_host.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)


INSTALL = {'root':'/protected/reviewer','worker':{'uid':503},'publisher':{'uid':502}}


class ActivityTests(unittest.TestCase):
    def test_ps_nobody_uid_does_not_break_reviewer_inventory(self):
        raw=b'-2 42 1 Tue Oct 6 11:57:26 2026\n503 101 1 Tue Oct 6 11:57:26 2026\n'
        with patch.object(c.subprocess,'run',return_value=SimpleNamespace(stdout=raw)):
            self.assertEqual(c.process_inventory(503,502,time.monotonic()+20),[(503,101,1,'Tue Oct 6 11:57:26 2026')])

    def test_verified_launchd_helpers_do_not_count_as_a_live_review(self):
        rows=[(503,101,1,'Tue Oct 6 11:57:26 2026')]
        with patch.object(c.subprocess,'run',return_value=SimpleNamespace(stdout=b'503 /usr/sbin/cfprefsd\n')),patch.object(c,'process_inventory',return_value=rows,create=True),patch.object(c,'kernel_process_path',return_value='/usr/sbin/cfprefsd',create=True),patch.object(c,'trusted_background_process',return_value=True,create=True):
            self.assertFalse(c.reviewer_activity(INSTALL))

    def test_unknown_unsigned_and_non_launchd_worker_processes_stay_blocking(self):
        for parent,trusted in ((1,False),(900,True)):
            with self.subTest(parent=parent,trusted=trusted),patch.object(c,'process_inventory',return_value=[(503,101,parent,'start')]),patch.object(c,'kernel_process_path',return_value='/usr/sbin/cfprefsd'),patch.object(c,'trusted_background_process',return_value=trusted):
                self.assertTrue(c.reviewer_activity(INSTALL))
        self.assertFalse(c.trusted_background_process('/tmp/cfprefsd',time.monotonic()+20))

    def test_active_publisher_and_process_replacement_are_blocking(self):
        with patch.object(c,'process_inventory',return_value=[(502,101,1,'start')]),patch.object(c,'kernel_process_path',return_value=str(Path(INSTALL['root'])/'code/release/bin/node')):
            self.assertTrue(c.reviewer_activity(INSTALL))
        with patch.object(c,'process_inventory',side_effect=[[(503,101,1,'start')],[(503,102,1,'later')]]),patch.object(c,'kernel_process_path',return_value='/usr/sbin/cfprefsd'),patch.object(c,'trusted_background_process',return_value=True):
            self.assertTrue(c.reviewer_activity(INSTALL))
        with patch.object(c,'process_inventory',return_value=[(503,101,1,'start')]),patch.object(c,'kernel_process_path',side_effect=['/usr/sbin/cfprefsd','/tmp/spoof']),patch.object(c,'trusted_background_process',return_value=True):
            self.assertTrue(c.reviewer_activity(INSTALL))

    def test_unsigned_or_unprotected_allowlisted_binary_is_not_trusted(self):
        with patch.object(c.Path,'lstat',return_value=SimpleNamespace(st_uid=501,st_mode=0o100755)):
            self.assertFalse(c.trusted_background_process('/usr/sbin/cfprefsd',time.monotonic()+20))

        with patch.object(c.Path,'lstat',return_value=SimpleNamespace(st_uid=0,st_mode=0o100755)),patch.object(c.subprocess,'run',side_effect=lambda args,**kw:SimpleNamespace(stdout=b'one line\n',returncode=1 if args[0]=='/usr/bin/codesign' else 0)):
            self.assertFalse(c.trusted_background_process('/usr/sbin/cfprefsd',time.monotonic()+20))

    def test_exiting_process_is_busy_until_a_stable_inventory_is_observed(self):
        with patch.object(c,'process_inventory',return_value=[(503,101,1,'start')]),patch.object(c,'kernel_process_path',side_effect=ValueError('process disappeared')):
            self.assertTrue(c.reviewer_activity(INSTALL))


if __name__=='__main__':unittest.main()
